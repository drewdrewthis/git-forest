import { useState, useEffect, useCallback, useRef } from "react";
import { listWorktrees } from "../lib/git.js";
import { getAllPrs, enrichPrDetails, isGhAvailable, extractIssueNumber, getIssueStates, type IssueState } from "../lib/github.js";
import { listTmuxSessions, findSessionForWorktree } from "../lib/tmux.js";
import { loadConfig } from "../lib/config.js";
import { fetchRemoteWorktrees } from "../lib/remote.js";
import { log } from "../lib/log.js";
import type { Worktree } from "../lib/types.js";
import type { TmuxSession } from "../lib/tmux.js";
import type { PrInfo } from "../lib/types.js";

const AUTO_REFRESH_MS = 60_000;

export function fetchGitWorktrees(): Worktree[] {
  log.time("phase:git");
  const trees = listWorktrees();
  log.timeEnd("phase:git");
  log.info(`worktrees: ${trees.length} found`);
  return trees;
}

export async function fetchTmuxAndGh(): Promise<{ sessions: TmuxSession[]; ghOk: boolean }> {
  log.time("phase:tmux+gh");
  const [sessions, ghOk] = await Promise.all([
    listTmuxSessions(),
    isGhAvailable(),
  ]);
  log.timeEnd("phase:tmux+gh");
  return { sessions, ghOk };
}

export function mergeTmuxSessions(
  trees: Worktree[],
  sessions: TmuxSession[],
  ghOk: boolean
): Worktree[] {
  return trees.map((tree) => {
    const session = findSessionForWorktree(sessions, tree.path, tree.branch);
    return {
      ...tree,
      tmuxSession: session?.name ?? null,
      tmuxAttached: session?.attached ?? false,
      prLoading: !tree.isBare && !!tree.branch && ghOk,
    };
  });
}

export async function fetchPrBasics(branches: string[] = []): Promise<Map<string, PrInfo>> {
  log.time("phase:pr-basics");
  const prMap = await getAllPrs(branches);
  log.timeEnd("phase:pr-basics");
  log.info(`PRs: ${prMap.size} found`);
  return prMap;
}

export function applyPrs(base: Worktree[], prMap: Map<string, PrInfo>): Worktree[] {
  return base.map((tree) => {
    if (!tree.branch || tree.isBare) return { ...tree, prLoading: false };
    return { ...tree, pr: prMap.get(tree.branch) ?? null, prLoading: false };
  });
}

export async function enrichPrs(prMap: Map<string, PrInfo>): Promise<void> {
  log.time("phase:pr-enrich");
  await enrichPrDetails(prMap);
  log.timeEnd("phase:pr-enrich");
}

export async function fetchIssueStates(trees: Worktree[]): Promise<Map<number, IssueState>> {
  const issueEntries: Array<{ index: number; issueNumber: number }> = [];
  for (let i = 0; i < trees.length; i++) {
    const tree = trees[i]!;
    if (tree.pr || tree.isBare || !tree.branch) continue;
    const num = extractIssueNumber(tree.branch);
    if (num !== null) issueEntries.push({ index: i, issueNumber: num });
  }
  if (issueEntries.length === 0) return new Map();

  const uniqueNumbers = [...new Set(issueEntries.map((e) => e.issueNumber))];
  return getIssueStates(uniqueNumbers);
}

export function applyIssueStates(
  trees: Worktree[],
  issueStates: Map<number, IssueState>
): Worktree[] {
  if (issueStates.size === 0) return trees;
  return trees.map((tree) => {
    if (tree.pr || tree.isBare || !tree.branch) return tree;
    const num = extractIssueNumber(tree.branch);
    if (num === null) return tree;
    const state = issueStates.get(num);
    if (!state) return tree;
    return { ...tree, issueNumber: num, issueState: state };
  });
}

export function useWorktrees() {
  const [worktrees, setWorktrees] = useState<Worktree[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const trees = fetchGitWorktrees();
      setWorktrees(trees.map((tree) => ({ ...tree, prLoading: !tree.isBare && !!tree.branch })));
      setLoading(false);

      const { sessions, ghOk } = await fetchTmuxAndGh();
      const withTmux = mergeTmuxSessions(trees, sessions, ghOk);

      if (!ghOk) {
        setWorktrees(withTmux);
        return;
      }

      setWorktrees(withTmux);

      const worktreeBranches = withTmux
        .filter((t) => !t.isBare && t.branch)
        .map((t) => t.branch!);
      const prMap = await fetchPrBasics(worktreeBranches);
      const withPrs = applyPrs(withTmux, prMap);
      setWorktrees(withPrs);

      // Fetch remote worktrees in parallel with PR enrichment
      const config = loadConfig();
      const remotePromise = config.remote
        ? fetchRemoteWorktrees(config.remote)
        : Promise.resolve([]);
      const [, remoteTrees] = await Promise.all([
        enrichPrs(prMap),
        remotePromise,
      ]);

      // Apply enriched PRs to local and remote, then combine
      const localWithPrs = applyPrs(withTmux, prMap);
      const remotesWithPrs = remoteTrees.map((tree) => {
        if (!tree.branch || tree.isBare) return tree;
        return { ...tree, pr: prMap.get(tree.branch) ?? null };
      });

      const allTrees = [...localWithPrs, ...remotesWithPrs];

      // Enrich worktrees without PRs with issue closed state
      const issueStates = await fetchIssueStates(allTrees);
      const withIssues = applyIssueStates(allTrees, issueStates);

      setWorktrees(withIssues);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to list worktrees";
      log.error(`refresh failed: ${message}`);
      setError(message);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      refresh();
    }, AUTO_REFRESH_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [refresh]);

  return { worktrees, loading, error, refresh };
}
