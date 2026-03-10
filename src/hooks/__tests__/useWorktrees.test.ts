import { describe, it, expect } from "vitest";
import { mergeTmuxSessions, applyPrs } from "../useWorktrees.js";
import type { Worktree, PrInfo } from "../../lib/types.js";
import type { TmuxSession } from "../../lib/tmux.js";

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

describe("mergeTmuxSessions", () => {
  it("attaches matching session by path", () => {
    const trees = [makeWorktree({ path: "/repo/main", branch: "main" })];
    const sessions: TmuxSession[] = [{ name: "main", path: "/repo/main", attached: true }];

    const result = mergeTmuxSessions(trees, sessions, true);

    expect(result[0]!.tmuxSession).toBe("main");
    expect(result[0]!.tmuxAttached).toBe(true);
  });

  it("sets prLoading based on ghOk flag", () => {
    const trees = [makeWorktree({ branch: "feat" })];
    const sessions: TmuxSession[] = [];

    const withGh = mergeTmuxSessions(trees, sessions, true);
    const withoutGh = mergeTmuxSessions(trees, sessions, false);

    expect(withGh[0]!.prLoading).toBe(true);
    expect(withoutGh[0]!.prLoading).toBe(false);
  });

  it("skips prLoading for bare worktrees", () => {
    const trees = [makeWorktree({ isBare: true, branch: null })];

    const result = mergeTmuxSessions(trees, [], true);

    expect(result[0]!.prLoading).toBe(false);
  });

  it("returns null session when no match found", () => {
    const trees = [makeWorktree({ path: "/no/match" })];

    const result = mergeTmuxSessions(trees, [], true);

    expect(result[0]!.tmuxSession).toBeNull();
    expect(result[0]!.tmuxAttached).toBe(false);
  });
});

describe("applyPrs", () => {
  it("maps PR from prMap by branch name", () => {
    const trees = [makeWorktree({ branch: "feat" })];
    const prMap = new Map([["feat", basePr]]);

    const result = applyPrs(trees, prMap);

    expect(result[0]!.pr).toEqual(basePr);
    expect(result[0]!.prLoading).toBe(false);
  });

  it("sets null PR when branch has no matching PR", () => {
    const trees = [makeWorktree({ branch: "no-pr" })];
    const prMap = new Map<string, PrInfo>();

    const result = applyPrs(trees, prMap);

    expect(result[0]!.pr).toBeNull();
  });

  it("skips bare worktrees", () => {
    const trees = [makeWorktree({ isBare: true, branch: null })];
    const prMap = new Map<string, PrInfo>();

    const result = applyPrs(trees, prMap);

    expect(result[0]!.pr).toBeNull();
    expect(result[0]!.prLoading).toBe(false);
  });

  it("skips worktrees with null branch", () => {
    const trees = [makeWorktree({ branch: null })];
    const prMap = new Map([["main", basePr]]);

    const result = applyPrs(trees, prMap);

    expect(result[0]!.pr).toBeNull();
  });
});
