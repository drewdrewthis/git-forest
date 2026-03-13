import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Worktree, PrInfo } from "../../lib/types.js";

vi.mock("../../lib/git.js", () => ({
  listWorktrees: vi.fn(),
}));

vi.mock("../../lib/github.js", () => ({
  getAllPrs: vi.fn(),
  enrichPrDetails: vi.fn(),
  isGhAvailable: vi.fn(),
  extractIssueNumber: vi.fn(),
  getIssueStates: vi.fn(),
}));

vi.mock("../../lib/tmux.js", () => ({
  listTmuxSessions: vi.fn(),
  findSessionForWorktree: vi.fn(),
}));

vi.mock("../../lib/config.js", () => ({
  loadConfig: vi.fn(),
}));

vi.mock("../../lib/remote.js", () => ({
  fetchRemoteWorktrees: vi.fn(),
}));

vi.mock("../../lib/log.js", () => ({
  log: { time: vi.fn(), timeEnd: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

const { listWorktrees } = await import("../../lib/git.js");
const { getAllPrs, enrichPrDetails, isGhAvailable, extractIssueNumber, getIssueStates } = await import("../../lib/github.js");
const { listTmuxSessions, findSessionForWorktree } = await import("../../lib/tmux.js");
const { loadConfig } = await import("../../lib/config.js");
const { fetchRemoteWorktrees } = await import("../../lib/remote.js");
const { refreshWorktrees } = await import("../useWorktrees.js");

const basePr: PrInfo = {
  number: 1,
  state: "open",
  title: "test",
  url: "https://example.com/pr/1",
  reviewDecision: "APPROVED",
  unresolvedThreads: 0,
  checksStatus: "pass",
  hasConflicts: false,
};

function makeWorktree(overrides: Partial<Worktree> = {}): Worktree {
  return {
    path: "/home/user/project",
    branch: "main",
    head: "abc1234",
    isBare: false,
    hasConflicts: false,
    pr: null,
    prLoading: false,
    tmuxSession: null,
    tmuxAttached: false,
    ...overrides,
  };
}

/**
 * Simulates React's functional setState: tracks every call and resolves
 * updater functions against the current state.
 */
function createStatefulSpy(initial: Worktree[] = []) {
  let current = initial;
  const snapshots: Worktree[][] = [];
  const spy = vi.fn((updater: Worktree[] | ((prev: Worktree[]) => Worktree[])) => {
    if (typeof updater === "function") {
      current = updater(current);
    } else {
      current = updater;
    }
    snapshots.push([...current]);
  });
  return { spy, snapshots, getCurrent: () => current };
}

function setupFullMocks() {
  const localTree = makeWorktree({ path: "/repo/feat", branch: "feat-1" });
  const remoteTree = makeWorktree({ path: "/remote/fix", branch: "fix-2", remote: "myserver" });

  vi.mocked(listWorktrees).mockReturnValue([localTree]);
  vi.mocked(listTmuxSessions).mockResolvedValue([]);
  vi.mocked(isGhAvailable).mockResolvedValue(true);
  vi.mocked(findSessionForWorktree).mockReturnValue(null);
  vi.mocked(getAllPrs).mockResolvedValue(new Map([["feat-1", basePr]]));
  vi.mocked(enrichPrDetails).mockResolvedValue(undefined);
  vi.mocked(extractIssueNumber).mockReturnValue(null);
  vi.mocked(getIssueStates).mockResolvedValue(new Map());
  vi.mocked(loadConfig).mockReturnValue({
    remote: { host: "myserver", user: "me", repoPath: "/repo" },
  } as ReturnType<typeof loadConfig>);
  vi.mocked(fetchRemoteWorktrees).mockResolvedValue([remoteTree]);

  return { localTree, remoteTree };
}

describe("refreshWorktrees", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("setState call count (Scenario: refresh produces at most 3 intermediate renders)", () => {
    it("calls setWorktrees at most 3 times during a full refresh cycle", async () => {
      setupFullMocks();
      const { spy } = createStatefulSpy();

      await refreshWorktrees(spy, vi.fn(), vi.fn());

      expect(spy).toHaveBeenCalledTimes(3);
    });

    it("includes all local and remote worktrees with PRs in the final call", async () => {
      const { localTree, remoteTree } = setupFullMocks();
      const { spy, snapshots } = createStatefulSpy();

      await refreshWorktrees(spy, vi.fn(), vi.fn());

      const finalState = snapshots[snapshots.length - 1]!;
      const local = finalState.find((t) => t.path === localTree.path);
      expect(local).toBeDefined();
      expect(local!.pr).toEqual(basePr);

      const remote = finalState.find((t) => t.path === remoteTree.path);
      expect(remote).toBeDefined();
      expect(remote!.remote).toBe("myserver");
    });

    it("calls setWorktrees only 2 times when gh is not available", async () => {
      setupFullMocks();
      vi.mocked(isGhAvailable).mockResolvedValue(false);
      const { spy } = createStatefulSpy();

      await refreshWorktrees(spy, vi.fn(), vi.fn());

      expect(spy).toHaveBeenCalledTimes(2);
    });
  });

  describe("intermediate state preserves remotes (Scenario: intermediate state always includes stale remote worktrees)", () => {
    it("never removes existing remote worktrees from any intermediate state", async () => {
      setupFullMocks();
      const staleRemote = makeWorktree({
        path: "/remote/old",
        branch: "old-branch",
        remote: "myserver",
      });
      const { spy, snapshots } = createStatefulSpy([staleRemote]);

      await refreshWorktrees(spy, vi.fn(), vi.fn());

      for (let i = 0; i < snapshots.length; i++) {
        const remotes = snapshots[i]!.filter((t) => t.remote);
        expect(remotes.length).toBeGreaterThan(0);
      }
    });

    it("preserves stale remote worktrees in the first setState call", async () => {
      setupFullMocks();
      const staleRemote = makeWorktree({
        path: "/remote/stale",
        branch: "stale-branch",
        remote: "oldserver",
      });
      const { spy, snapshots } = createStatefulSpy([staleRemote]);

      await refreshWorktrees(spy, vi.fn(), vi.fn());

      const firstState = snapshots[0]!;
      const staleInFirst = firstState.find((t) => t.path === "/remote/stale");
      expect(staleInFirst).toBeDefined();
      expect(staleInFirst!.remote).toBe("oldserver");
      expect(staleInFirst!.prLoading).toBe(true);
    });
  });

  describe("progressive rendering (Scenario: local worktrees appear before network enrichment completes)", () => {
    it("displays local worktrees in the first setState call before PR data", async () => {
      const { localTree } = setupFullMocks();
      const { spy, snapshots } = createStatefulSpy();

      await refreshWorktrees(spy, vi.fn(), vi.fn());

      expect(snapshots.length).toBeGreaterThanOrEqual(1);
      const firstState = snapshots[0]!;
      const local = firstState.find((t) => t.path === localTree.path);
      expect(local).toBeDefined();
      expect(local!.branch).toBe("feat-1");
      // PR should not yet be applied in the first call
      expect(local!.pr).toBeNull();
      expect(local!.prLoading).toBe(true);
    });

    it("merges PR and remote data in subsequent setState calls", async () => {
      setupFullMocks();
      const { spy, snapshots } = createStatefulSpy();

      await refreshWorktrees(spy, vi.fn(), vi.fn());

      // Second call should have PR data (tmux + PRs batched)
      const secondState = snapshots[1]!;
      const withPr = secondState.find((t) => t.branch === "feat-1");
      expect(withPr).toBeDefined();
      expect(withPr!.pr).toEqual(basePr);
      expect(withPr!.prLoading).toBe(false);
    });
  });
});
