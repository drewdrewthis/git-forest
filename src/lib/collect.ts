import { fetchGitWorktrees, fetchTmuxAndGh, mergeTmuxSessions, fetchPrBasics, applyPrs, enrichPrs, fetchIssueStates, applyIssueStates } from "../hooks/useWorktrees.js";
import { loadConfig } from "./config.js";
import { fetchRemoteWorktrees } from "./remote.js";
import type { Worktree } from "./types.js";

export async function collectWorktreeData(): Promise<Worktree[]> {
  const trees = fetchGitWorktrees();
  const { sessions, ghOk } = await fetchTmuxAndGh();
  const withTmux = mergeTmuxSessions(trees, sessions, ghOk);

  if (!ghOk) return withTmux;

  const worktreeBranches = withTmux
    .filter((t) => !t.isBare && t.branch)
    .map((t) => t.branch!);
  const prMap = await fetchPrBasics(worktreeBranches);
  const config = loadConfig();

  const remotePromise = config.remote
    ? fetchRemoteWorktrees(config.remote)
    : Promise.resolve([]);
  const [, remoteTrees] = await Promise.all([
    enrichPrs(prMap),
    remotePromise,
  ]);

  const localWithPrs = applyPrs(withTmux, prMap);
  const remotesWithPrs = remoteTrees.map((tree) => {
    if (!tree.branch || tree.isBare) return tree;
    return { ...tree, pr: prMap.get(tree.branch) ?? null };
  });

  const allTrees = [...localWithPrs, ...remotesWithPrs];
  const issueStates = await fetchIssueStates(allTrees);
  return applyIssueStates(allTrees, issueStates);
}
