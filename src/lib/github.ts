import { execa } from "execa";
import { log } from "./log.js";
import type { PrInfo, ReviewDecision, ChecksStatus } from "./types.js";

interface RawPr {
  headRefName: string;
  number: number;
  state: string;
  title: string;
  url: string;
  reviewDecision: string;
}

const VALID_PR_STATES = new Set(["open", "merged", "closed"]);

function isValidPrState(state: string): boolean {
  return VALID_PR_STATES.has(state.toLowerCase());
}

/**
 * Fetch PRs and return a map of branch → PrInfo.
 * First fetches all open PRs, then does targeted lookups for any
 * worktree branches that weren't found (to catch merged/closed PRs).
 * Never throws — returns empty map on failure.
 */
export async function getAllPrs(
  branches: string[] = []
): Promise<Map<string, PrInfo>> {
  const prMap = new Map<string, PrInfo>();

  try {
    log.time("getAllPrs");

    // Fetch all open PRs — this is the primary set we care about
    const { stdout } = await execa("gh", [
      "pr",
      "list",
      "--state",
      "open",
      "--json",
      "headRefName,number,state,title,url,reviewDecision",
      "--limit",
      "300",
    ]);

    const results: RawPr[] = JSON.parse(stdout);
    for (const raw of results) {
      if (prMap.has(raw.headRefName)) continue;
      if (!isValidPrState(raw.state)) continue;
      prMap.set(raw.headRefName, rawToPrInfo(raw));
    }

    // For worktree branches not found, search for their closed/merged PRs
    const missing = branches.filter((b) => !prMap.has(b));
    if (missing.length > 0) {
      log.info(`getAllPrs: looking up ${missing.length} missing branches`);
      const found = await lookupBranchPrs(missing);
      for (const [branch, pr] of found) {
        prMap.set(branch, pr);
      }
    }

    log.timeEnd("getAllPrs");
    log.info(`getAllPrs: ${prMap.size} PRs`);
    return prMap;
  } catch (err) {
    log.timeEnd("getAllPrs");
    log.warn(`getAllPrs failed: ${err instanceof Error ? err.message : "unknown"}`);
    return prMap;
  }
}

function rawToPrInfo(raw: RawPr): PrInfo {
  return {
    number: raw.number,
    state: raw.state.toLowerCase() as PrInfo["state"],
    title: raw.title,
    url: raw.url,
    reviewDecision: (raw.reviewDecision || "") as ReviewDecision,
    unresolvedThreads: 0,
    checksStatus: "none",
    hasConflicts: false,
  };
}

/**
 * Look up closed/merged PRs for specific branches using --head filter.
 * Runs lookups in parallel (batched to avoid overwhelming gh).
 */
async function lookupBranchPrs(
  branches: string[]
): Promise<Map<string, PrInfo>> {
  const result = new Map<string, PrInfo>();
  const CONCURRENCY = 5;

  for (let i = 0; i < branches.length; i += CONCURRENCY) {
    const batch = branches.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map(async (branch) => {
        const { stdout } = await execa("gh", [
          "pr",
          "list",
          "--head",
          branch,
          "--state",
          "all",
          "--json",
          "headRefName,number,state,title,url,reviewDecision",
          "--limit",
          "1",
        ]);
        const prs: RawPr[] = JSON.parse(stdout);
        if (prs.length > 0) {
          result.set(branch, rawToPrInfo(prs[0]!));
        }
      })
    );
    for (const s of settled) {
      if (s.status === "rejected") {
        log.warn(`lookupBranchPrs: ${s.reason}`);
      }
    }
  }

  return result;
}

/**
 * Enrich existing PrInfo map with checks and unresolved threads.
 * Fetched via a single GraphQL query. Never throws — silently
 * leaves defaults on failure.
 */
export async function enrichPrDetails(
  prMap: Map<string, PrInfo>
): Promise<void> {
  const MAX_ENRICH_BATCH = 25;
  const openPrs = [...prMap.entries()]
    .filter(([, pr]) => pr.state === "open")
    .slice(0, MAX_ENRICH_BATCH);
  if (openPrs.length === 0) return;

  try {
    log.time("enrichPrDetails");
    const { owner, name } = await getRepo();

    const prFragments = openPrs
      .map(
        ([, pr], i) => `pr${i}: pullRequest(number: ${pr.number}) {
        number
        mergeable
        reviewDecision
        latestReviews(first: 20) { nodes { state } }
        reviewThreads(first: 100) { nodes { isResolved } }
        commits(last: 1) {
          nodes {
            commit {
              statusCheckRollup {
                contexts(first: 100) {
                  nodes {
                    ... on CheckRun { status conclusion }
                    ... on StatusContext { state }
                  }
                }
              }
            }
          }
        }
      }`
      )
      .join("\n");

    const query = `query($owner: String!, $name: String!) {
      repository(owner: $owner, name: $name) {
        ${prFragments}
      }
    }`;

    const { stdout } = await execa("gh", [
      "api",
      "graphql",
      "-f",
      `query=${query}`,
      "-f",
      `owner=${owner}`,
      "-f",
      `name=${name}`,
    ]);

    const data = JSON.parse(stdout);
    const repo = data.data.repository;

    for (let i = 0; i < openPrs.length; i++) {
      const [branch, pr] = openPrs[i]!;
      const node = repo[`pr${i}`];
      if (!node) continue;

      const unresolved = node.reviewThreads.nodes.filter(
        (t: { isResolved: boolean }) => !t.isResolved
      ).length;

      const commitNode = node.commits?.nodes?.[0]?.commit;
      const contexts =
        commitNode?.statusCheckRollup?.contexts?.nodes ?? [];

      pr.hasConflicts = node.mergeable === "CONFLICTING";
      pr.unresolvedThreads = unresolved;
      pr.checksStatus = deriveChecksStatus(contexts);
      pr.reviewDecision = deriveReviewDecision(
        node.reviewDecision ?? "",
        node.latestReviews?.nodes ?? []
      );
      prMap.set(branch, pr);
    }
    log.timeEnd("enrichPrDetails");
  } catch (err) {
    log.timeEnd("enrichPrDetails");
    log.warn(`enrichPrDetails failed: ${err instanceof Error ? err.message : "unknown"}`);
  }
}

interface ReviewNode {
  state: string;
}

/**
 * Derive review decision. GitHub only populates reviewDecision when
 * branch protection requires reviews. For repos without that setting,
 * we derive the state from individual review states.
 */
export function deriveReviewDecision(
  reviewDecision: string,
  latestReviews: ReviewNode[]
): ReviewDecision {
  if (reviewDecision) return reviewDecision as ReviewDecision;

  // No branch protection — derive from individual reviews
  const states = latestReviews.map((r) => r.state);
  if (states.includes("CHANGES_REQUESTED")) return "CHANGES_REQUESTED";
  if (states.includes("APPROVED")) return "APPROVED";
  return "";
}

interface CheckContext {
  status?: string;
  conclusion?: string | null;
  state?: string;
}

export function deriveChecksStatus(contexts: CheckContext[]): ChecksStatus {
  if (contexts.length === 0) return "none";

  let hasInProgress = false;
  for (const ctx of contexts) {
    // CheckRun nodes
    if (ctx.status !== undefined) {
      if (ctx.status !== "COMPLETED") {
        hasInProgress = true;
        continue;
      }
      if (
        ctx.conclusion === "FAILURE" ||
        ctx.conclusion === "TIMED_OUT" ||
        ctx.conclusion === "CANCELLED"
      ) {
        return "fail";
      }
    }
    // StatusContext nodes (commit status API)
    if (ctx.state !== undefined) {
      if (ctx.state === "PENDING") {
        hasInProgress = true;
      } else if (ctx.state === "FAILURE" || ctx.state === "ERROR") {
        return "fail";
      }
    }
  }

  return hasInProgress ? "pending" : "pass";
}

type Repo = { owner: string; name: string };

let cachedRepo: Repo | null = null;

export async function getRepo(): Promise<Repo> {
  if (cachedRepo) return cachedRepo;
  const { stdout } = await execa("gh", [
    "repo",
    "view",
    "--json",
    "owner,name",
  ]);
  const { owner, name } = JSON.parse(stdout);
  cachedRepo = { owner: owner.login, name };
  return cachedRepo;
}

/**
 * Extract an issue number from a branch name.
 * Matches patterns like: issue1234, issue-1234, issue/1234, 1234-description,
 * feat/1234-desc, fix-1234. Only matches numbers >= 100 to avoid false
 * positives from version numbers or other small embedded numbers.
 */
export function extractIssueNumber(branch: string): number | null {
  // Strip common prefixes like "feat/", "fix/", "chore/" etc.
  const stripped = branch.replace(/^[a-zA-Z-]+\//, "");

  // Pattern 1: "issue" followed by optional separator then number
  const issuePattern = /issue[/-]?(\d+)/i;
  const issueMatch = branch.match(issuePattern);
  if (issueMatch) {
    const num = parseInt(issueMatch[1]!, 10);
    if (num >= 1) return num;
  }

  // Pattern 2: number at the start of the (stripped) branch name, e.g. "1234-fix-bug"
  const leadingPattern = /^(\d+)[-/]/;
  const leadingMatch = stripped.match(leadingPattern);
  if (leadingMatch) {
    const num = parseInt(leadingMatch[1]!, 10);
    if (num >= 100) return num;
  }

  // Pattern 3: number preceded by a separator, e.g. "fix-1234" or "fix-1234-desc"
  const embeddedPattern = /[-/](\d+)(?:[-/]|$)/;
  const embeddedMatch = stripped.match(embeddedPattern);
  if (embeddedMatch) {
    const num = parseInt(embeddedMatch[1]!, 10);
    if (num >= 100) return num;
  }

  return null;
}

/**
 * Batch-fetch issue states via a single GraphQL query.
 * Never throws -- returns empty map on failure.
 */
export type IssueState = "open" | "closed" | "completed";

/**
 * Batch-fetch issue states via a single GraphQL query.
 * Returns "completed" when the issue was closed via a merged PR (stateReason: COMPLETED),
 * "closed" for other closures (NOT_PLANNED, etc.), and "open" for open issues.
 * Never throws -- returns empty map on failure.
 */
export async function getIssueStates(
  issueNumbers: number[]
): Promise<Map<number, IssueState>> {
  const result = new Map<number, IssueState>();
  if (issueNumbers.length === 0) return result;

  const MAX_BATCH = 25;
  const batch = issueNumbers.slice(0, MAX_BATCH);

  try {
    log.time("getIssueStates");
    const { owner, name } = await getRepo();

    const fragments = batch
      .map(
        (num, i) => `issue${i}: issue(number: ${num}) { number state stateReason }`
      )
      .join("\n");

    const query = `query($owner: String!, $name: String!) {
      repository(owner: $owner, name: $name) {
        ${fragments}
      }
    }`;

    const { stdout } = await execa("gh", [
      "api",
      "graphql",
      "-f",
      `query=${query}`,
      "-f",
      `owner=${owner}`,
      "-f",
      `name=${name}`,
    ]);

    const data = JSON.parse(stdout);
    const repo = data.data.repository;

    for (let i = 0; i < batch.length; i++) {
      const node = repo[`issue${i}`];
      if (!node) continue;
      const state = (node.state as string).toLowerCase();
      if (state === "open") {
        result.set(node.number as number, "open");
      } else if (state === "closed") {
        const reason = (node.stateReason as string | null) ?? "";
        result.set(node.number as number, reason === "COMPLETED" ? "completed" : "closed");
      }
    }

    log.timeEnd("getIssueStates");
    log.info(`getIssueStates: ${result.size} issues resolved`);
  } catch (err) {
    log.timeEnd("getIssueStates");
    log.warn(`getIssueStates failed: ${err instanceof Error ? err.message : "unknown"}`);
  }

  return result;
}

export async function isGhAvailable(): Promise<boolean> {
  try {
    await execa("gh", ["auth", "status"]);
    return true;
  } catch {
    return false;
  }
}
