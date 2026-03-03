import { describe, it, expect } from "vitest";
import {
  findSessionForWorktree,
  formatStatusLeft,
  switchToSession,
  deriveSessionName,
  type TmuxSession,
  type CommandRunner,
} from "../tmux.js";
import type { PrInfo } from "../types.js";

const sessions: TmuxSession[] = [
  { name: "main", path: "/home/user/project", attached: true },
  { name: "feat-login", path: "/home/user/project-login", attached: false },
  { name: "fix-typo", path: "/tmp/other", attached: false },
];

describe("findSessionForWorktree", () => {
  it("matches by session path", () => {
    const result = findSessionForWorktree(
      sessions,
      "/home/user/project",
      "main"
    );
    expect(result).toMatchObject({ name: "main", attached: true });
  });

  it("matches by directory name when path doesn't match", () => {
    const result = findSessionForWorktree(
      sessions,
      "/some/other/path/feat-login",
      "something-else"
    );
    expect(result).toMatchObject({ name: "feat-login" });
  });

  it("matches by branch name", () => {
    const result = findSessionForWorktree(
      sessions,
      "/completely/different/path",
      "fix-typo"
    );
    expect(result).toMatchObject({ name: "fix-typo" });
  });

  it("matches branch with slashes converted to dashes", () => {
    const sessionsWithSlash: TmuxSession[] = [
      { name: "feat-login", path: "/tmp/x", attached: false },
    ];
    const result = findSessionForWorktree(
      sessionsWithSlash,
      "/some/path",
      "feat/login"
    );
    expect(result).toMatchObject({ name: "feat-login" });
  });

  it("returns null when no match", () => {
    const result = findSessionForWorktree(
      sessions,
      "/no/match/here",
      "nonexistent-branch"
    );
    expect(result).toBeNull();
  });

  it("returns null for empty sessions list", () => {
    const result = findSessionForWorktree([], "/some/path", "main");
    expect(result).toBeNull();
  });

  it("returns null when branch is null and no path/dir match", () => {
    const result = findSessionForWorktree(
      sessions,
      "/no/match",
      null
    );
    expect(result).toBeNull();
  });

  it("prefers path match over name match", () => {
    const ambiguous: TmuxSession[] = [
      { name: "project", path: "/wrong/path", attached: false },
      { name: "other", path: "/home/user/project", attached: true },
    ];
    const result = findSessionForWorktree(
      ambiguous,
      "/home/user/project",
      "something"
    );
    expect(result).toMatchObject({ name: "other", attached: true });
  });
});

const openPr: PrInfo = {
  number: 42,
  state: "open",
  title: "Add login",
  url: "https://github.com/org/repo/pull/42",
  reviewDecision: "",
  unresolvedThreads: 0,
  checksStatus: "pass",
};

describe("deriveSessionName", () => {
  it("replaces slashes with dashes for branch names", () => {
    expect(deriveSessionName("feat/new-login", "/repo/wt")).toBe("feat-new-login");
  });

  it("uses last path segment when branch is null", () => {
    expect(deriveSessionName(null, "/repo/my-worktree")).toBe("my-worktree");
  });

  it("falls back to orchard for empty path", () => {
    expect(deriveSessionName(null, "")).toBe("orchard");
  });
});

describe("switchToSession", () => {
  function createMockRunner(): CommandRunner & { calls: Array<[string, string[]]> } {
    const calls: Array<[string, string[]]> = [];
    const runner = async (cmd: string, args: string[]) => {
      calls.push([cmd, args]);
      // Simulate has-session failing (session does not exist)
      if (args[0] === "has-session") {
        throw new Error("session not found");
      }
      return { stdout: "" };
    };
    return Object.assign(runner, { calls });
  }

  function createMockRunnerWithExistingSession(): CommandRunner & { calls: Array<[string, string[]]> } {
    const calls: Array<[string, string[]]> = [];
    const runner = async (cmd: string, args: string[]) => {
      calls.push([cmd, args]);
      return { stdout: "" };
    };
    return Object.assign(runner, { calls });
  }

  it("creates session when it does not exist before switching", async () => {
    const runner = createMockRunner();
    await switchToSession(
      {
        sessionName: "feat-login",
        worktreePath: "/repo/feat-login",
        branch: "feat/login",
        pr: null,
      },
      runner
    );

    const allCmds = runner.calls.map((c) => c[1]);
    // has-session check
    expect(allCmds[0]).toEqual(["has-session", "-t", "feat-login"]);
    // new-session (detached)
    expect(allCmds[1]).toEqual(["new-session", "-d", "-s", "feat-login", "-c", "/repo/feat-login"]);
    // switch-client is last
    expect(allCmds[allCmds.length - 1]).toEqual(["switch-client", "-t", "feat-login"]);
  });

  it("skips creation when session already exists", async () => {
    const runner = createMockRunnerWithExistingSession();
    await switchToSession(
      {
        sessionName: "feat-login",
        worktreePath: "/repo/feat-login",
        branch: "feat/login",
        pr: null,
      },
      runner
    );

    const allCmds = runner.calls.map((c) => c[1]);
    expect(allCmds[0]).toEqual(["has-session", "-t", "feat-login"]);
    // no new-session call
    expect(allCmds.every((a) => a[0] !== "new-session")).toBe(true);
    // switch-client still happens
    expect(allCmds[allCmds.length - 1]).toEqual(["switch-client", "-t", "feat-login"]);
  });

  it("configures status bar on new session via discrete set-option calls", async () => {
    const runner = createMockRunner();
    await switchToSession(
      {
        sessionName: "feat-login",
        worktreePath: "/repo/feat-login",
        branch: "feat/login",
        pr: null,
      },
      runner
    );

    const allCmds = runner.calls.map((c) => c[1]);
    expect(allCmds.some((a) => a[0] === "set-option" && a.includes("status") && a.includes("on"))).toBe(true);
    expect(allCmds.some((a) => a[0] === "set-option" && a.includes("status-left"))).toBe(true);
    expect(allCmds.some((a) => a[0] === "set-option" && a.includes("status-right"))).toBe(true);
    expect(allCmds.some((a) => a[0] === "bind-key")).toBe(true);
  });

  it("^B o keybinding switches directly to orchard session", async () => {
    const runner = createMockRunner();
    await switchToSession(
      {
        sessionName: "feat-login",
        worktreePath: "/repo/feat-login",
        branch: "feat/login",
        pr: null,
      },
      runner
    );

    const allCmds = runner.calls.map((c) => c[1]);
    const bindCall = allCmds.find((a) => a[0] === "bind-key");
    expect(bindCall).toContain("o");
    expect(bindCall).toContain("switch-client");
    expect(bindCall).toContain("orchard");
  });
});

describe("formatStatusLeft", () => {
  it("shows branch name without PR", () => {
    const result = formatStatusLeft("feat/login", null);
    expect(result).toContain("feat/login");
    expect(result).not.toContain("PR#");
  });

  it("shows detached when branch is null", () => {
    const result = formatStatusLeft(null, null);
    expect(result).toContain("detached");
  });

  it("shows unified status for open PR needing review", () => {
    const result = formatStatusLeft("feat/login", openPr);
    expect(result).toContain("PR#42");
    expect(result).toContain("review");
  });

  it("shows merged status", () => {
    const mergedPr: PrInfo = { ...openPr, state: "merged" };
    const result = formatStatusLeft("feat/login", mergedPr);
    expect(result).toContain("\u2713 merged");
  });

  it("shows closed status", () => {
    const closedPr: PrInfo = { ...openPr, state: "closed" };
    const result = formatStatusLeft("feat/login", closedPr);
    expect(result).toContain("\u2717 closed");
  });

  it("shows failing when checks fail", () => {
    const failingPr: PrInfo = { ...openPr, checksStatus: "fail" };
    const result = formatStatusLeft("feat/login", failingPr);
    expect(result).toContain("\u2717 failing");
  });

  it("shows ready when approved with passing checks", () => {
    const readyPr: PrInfo = { ...openPr, reviewDecision: "APPROVED", checksStatus: "pass" };
    const result = formatStatusLeft("feat/login", readyPr);
    expect(result).toContain("\u2713 ready");
  });
});
