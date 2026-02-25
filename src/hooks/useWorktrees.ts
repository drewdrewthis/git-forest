import { useState, useEffect, useCallback } from "react";
import { listWorktrees } from "../lib/git.js";
import { getAllPrs, enrichPrDetails, isGhAvailable } from "../lib/github.js";
import { listTmuxSessions, findSessionForWorktree } from "../lib/tmux.js";
import type { Worktree } from "../lib/types.js";

export function useWorktrees() {
  const [worktrees, setWorktrees] = useState<Worktree[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      // Phase 1: git data (synchronous, fast)
      const trees = listWorktrees();
      setWorktrees(trees.map((t) => ({ ...t, prLoading: !t.isBare && !!t.branch })));
      setLoading(false);

      // Phase 2: tmux + gh check (parallel)
      const [sessions, ghOk] = await Promise.all([
        listTmuxSessions(),
        isGhAvailable(),
      ]);

      const withTmux = trees.map((t) => {
        const session = findSessionForWorktree(sessions, t.path, t.branch);
        return {
          ...t,
          tmuxSession: session?.name ?? null,
          tmuxAttached: session?.attached ?? false,
          prLoading: !t.isBare && !!t.branch && ghOk,
        };
      });

      if (!ghOk) {
        setWorktrees(withTmux);
        return;
      }

      setWorktrees(withTmux);

      // Phase 3: batch fetch PR basics (fast — no statusCheckRollup)
      const prMap = await getAllPrs();
      const applyPrs = (base: Worktree[]) =>
        base.map((t) => {
          if (!t.branch || t.isBare) return { ...t, prLoading: false };
          return { ...t, pr: prMap.get(t.branch) ?? null, prLoading: false };
        });

      setWorktrees(applyPrs(withTmux));

      // Phase 4: enrich open PRs with checks + threads (slow, non-blocking)
      await enrichPrDetails(prMap);
      setWorktrees(applyPrs(withTmux));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to list worktrees"
      );
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { worktrees, loading, error, refresh };
}
