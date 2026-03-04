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

/**
 * Fetch all PRs in one call. Returns a map of branch → PrInfo.
 * Never throws — returns empty map on failure.
 */
export async function getAllPrs(): Promise<Map<string, PrInfo>> {
  try {
    log.time("getAllPrs");
    const { stdout } = await execa("gh", [
      "pr",
      "list",
      "--state",
      "all",
      "--json",
      "headRefName,number,state,title,url,reviewDecision",
      "--limit",
      "100",
    ]);

    const results: RawPr[] = JSON.parse(stdout);
    const prMap = new Map<string, PrInfo>();
    const validStates = new Set(["open", "merged", "closed"]);

    for (const raw of results) {
      if (prMap.has(raw.headRefName)) continue;

      const state = raw.state.toLowerCase();
      if (!validStates.has(state)) continue;

      prMap.set(raw.headRefName, {
        number: raw.number,
        state: state as PrInfo["state"],
        title: raw.title,
        url: raw.url,
        reviewDecision: (raw.reviewDecision || "") as ReviewDecision,
        unresolvedThreads: 0,
        checksStatus: "none",
      });
    }

    log.timeEnd("getAllPrs");
    log.info(`getAllPrs: ${prMap.size} PRs`);
    return prMap;
  } catch (err) {
    log.timeEnd("getAllPrs");
    log.warn(`getAllPrs failed: ${err instanceof Error ? err.message : "unknown"}`);
    return new Map();
  }
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

async function getRepo(): Promise<Repo> {
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

export async function isGhAvailable(): Promise<boolean> {
  try {
    await execa("gh", ["auth", "status"]);
    return true;
  } catch {
    return false;
  }
}
