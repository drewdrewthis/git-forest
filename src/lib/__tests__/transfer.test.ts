import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Worktree } from "../types.js";

vi.mock("execa", () => ({
  execa: vi.fn(),
}));

vi.mock("../remote.js", () => ({
  sshExec: vi.fn(),
  killRemoteTmuxSession: vi.fn(),
  removeRemoteWorktree: vi.fn(),
}));

vi.mock("../git.js", () => ({
  removeWorktree: vi.fn(),
}));

vi.mock("../tmux.js", () => ({
  killTmuxSession: vi.fn(),
  deriveSessionName: vi.fn((repoName: string, branch: string | null, _path: string) =>
    branch ? `${repoName}:${branch.replace(/\//g, "-")}` : `${repoName}:orchard`,
  ),
}));

import { execa } from "execa";
import { sshExec, killRemoteTmuxSession, removeRemoteWorktree } from "../remote.js";
import { removeWorktree } from "../git.js";
import { killTmuxSession } from "../tmux.js";
import {
  sanitizeBranchSlug,
  deriveRemoteWorktreePath,
  deriveLocalWorktreePath,
  pushToRemote,
  pullToLocal,
} from "../transfer.js";

const mockExeca = vi.mocked(execa);
const mockSshExec = vi.mocked(sshExec);
const mockKillRemoteTmuxSession = vi.mocked(killRemoteTmuxSession);
const mockRemoveRemoteWorktree = vi.mocked(removeRemoteWorktree);
const mockRemoveWorktree = vi.mocked(removeWorktree);
const mockKillTmuxSession = vi.mocked(killTmuxSession);

function makeWorktree(overrides: Partial<Worktree> = {}): Worktree {
  return {
    path: "/repo/worktrees/feat-login",
    branch: "feat/login",
    head: "abc123",
    isBare: false,
    hasConflicts: false,
    pr: null,
    prLoading: false,
    tmuxSession: "feat-login",
    tmuxAttached: false,
    ...overrides,
  };
}

const remote = { host: "ubuntu@10.0.3.56", repoPath: "/home/ubuntu/repo" };

beforeEach(() => {
  vi.resetAllMocks();
});

// ---------------------------------------------------------------------------
// sanitizeBranchSlug
// ---------------------------------------------------------------------------

describe("sanitizeBranchSlug", () => {
  it("replaces slashes with dashes", () => {
    expect(sanitizeBranchSlug("feat/login")).toBe("feat-login");
  });

  it("replaces multiple slashes", () => {
    expect(sanitizeBranchSlug("issue1707/add-metadata")).toBe("issue1707-add-metadata");
  });

  it("strips semicolons", () => {
    expect(sanitizeBranchSlug("feat;rm -rf /")).toBe("featrm-rf-");
  });

  it("strips backticks", () => {
    expect(sanitizeBranchSlug("feat`whoami`")).toBe("featwhoami");
  });

  it("strips pipes", () => {
    expect(sanitizeBranchSlug("feat|cat")).toBe("featcat");
  });

  it("strips spaces", () => {
    expect(sanitizeBranchSlug("feat login")).toBe("featlogin");
  });

  it("strips quotes", () => {
    expect(sanitizeBranchSlug(`feat'login"test`)).toBe("featlogintest");
  });

  it("preserves dots, underscores, and hyphens", () => {
    expect(sanitizeBranchSlug("feat_login-v2.0")).toBe("feat_login-v2.0");
  });

  it("handles empty string", () => {
    expect(sanitizeBranchSlug("")).toBe("");
  });

  it("handles complex shell-unsafe input", () => {
    const result = sanitizeBranchSlug("feat/login;rm -rf /`whoami`|cat");
    expect(result).not.toMatch(/[;`| ]/);
  });
});

// ---------------------------------------------------------------------------
// deriveRemoteWorktreePath
// ---------------------------------------------------------------------------

describe("deriveRemoteWorktreePath", () => {
  it("generates path from branch", () => {
    expect(deriveRemoteWorktreePath("/home/ubuntu/repo", "issue1707/add-metadata")).toBe(
      "/home/ubuntu/worktrees/worktree-issue1707-add-metadata",
    );
  });

  it("handles simple branch names", () => {
    expect(deriveRemoteWorktreePath("/home/ubuntu/repo", "main")).toBe(
      "/home/ubuntu/worktrees/worktree-main",
    );
  });
});

// ---------------------------------------------------------------------------
// deriveLocalWorktreePath
// ---------------------------------------------------------------------------

describe("deriveLocalWorktreePath", () => {
  it("generates resolved absolute path", () => {
    expect(deriveLocalWorktreePath("/Users/dev/project", "issue1707/add-metadata")).toBe(
      "/Users/dev/worktrees/worktree-issue1707-add-metadata",
    );
  });

  it("does not contain .. in output", () => {
    const result = deriveLocalWorktreePath("/Users/dev/project", "feat/login");
    expect(result).not.toContain("..");
  });

  it("returns absolute path", () => {
    const result = deriveLocalWorktreePath("/Users/dev/project", "feat/login");
    expect(result.startsWith("/")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// pushToRemote
// ---------------------------------------------------------------------------

describe("pushToRemote", () => {
  function setupHappyPath(): void {
    // getLastCommitMessage — returns something other than WIP handoff
    mockExeca.mockImplementation((async (cmd: string, args: string[]) => {
      const argStr = Array.isArray(args) ? args.join(" ") : "";

      // git log -1 --format=%s
      if (cmd === "git" && argStr.includes("log -1")) {
        return { stdout: "some normal commit" };
      }
      // git add -u
      if (cmd === "git" && argStr.includes("add -u")) {
        return { stdout: "" };
      }
      // git diff --cached --quiet — throw to indicate staged changes
      if (cmd === "git" && argStr.includes("diff --cached --quiet")) {
        throw new Error("staged changes exist");
      }
      // git commit
      if (cmd === "git" && argStr.includes("commit")) {
        return { stdout: "" };
      }
      // git push
      if (cmd === "git" && argStr.includes("push")) {
        return { stdout: "" };
      }
      return { stdout: "" };
    }) as unknown as typeof execa);

    mockSshExec.mockResolvedValue("");
    mockKillTmuxSession.mockResolvedValue(undefined);
    mockRemoveWorktree.mockResolvedValue(undefined);
  }

  it("calls all steps in order on happy path", async () => {
    setupHappyPath();

    const steps: string[] = [];
    const onStep = (step: string) => steps.push(step);

    await pushToRemote(makeWorktree(), remote, onStep);

    expect(steps).toEqual([
      "Committing changes...",
      "Pushing branch...",
      "Creating remote worktree...",
      "Creating remote session...",
      "Cleaning up local session...",
      "Removing local worktree...",
    ]);
  });

  it("commits WIP and pushes on happy path", async () => {
    setupHappyPath();

    await pushToRemote(makeWorktree(), remote, vi.fn());

    // Should have called git commit with WIP handoff message
    expect(mockExeca).toHaveBeenCalledWith(
      "git",
      ["commit", "-m", "[orchard] WIP handoff"],
      expect.objectContaining({ cwd: "/repo/worktrees/feat-login" }),
    );

    // Should have pushed
    expect(mockExeca).toHaveBeenCalledWith(
      "git",
      ["push", "-u", "origin", "feat/login"],
      expect.objectContaining({ cwd: "/repo/worktrees/feat-login" }),
    );
  });

  it("creates remote worktree and session via SSH", async () => {
    setupHappyPath();

    await pushToRemote(makeWorktree(), remote, vi.fn());

    // Remote worktree creation
    expect(mockSshExec).toHaveBeenCalledWith(
      "ubuntu@10.0.3.56",
      expect.stringContaining("git worktree add"),
    );

    // Remote tmux session
    expect(mockSshExec).toHaveBeenCalledWith(
      "ubuntu@10.0.3.56",
      expect.stringContaining("tmux new-session"),
    );
  });

  it("kills local tmux session and removes local worktree", async () => {
    setupHappyPath();

    await pushToRemote(makeWorktree(), remote, vi.fn());

    expect(mockKillTmuxSession).toHaveBeenCalledWith("feat-login");
    expect(mockRemoveWorktree).toHaveBeenCalledWith("/repo/worktrees/feat-login", true);
  });

  it("refuses when worktree has merge conflicts", async () => {
    const wt = makeWorktree({ hasConflicts: true });

    await expect(pushToRemote(wt, remote, vi.fn())).rejects.toThrow("merge conflicts");
    expect(mockExeca).not.toHaveBeenCalled();
    expect(mockSshExec).not.toHaveBeenCalled();
  });

  it("refuses on detached HEAD", async () => {
    const wt = makeWorktree({ branch: null });

    await expect(pushToRemote(wt, remote, vi.fn())).rejects.toThrow("detached HEAD");
    expect(mockExeca).not.toHaveBeenCalled();
  });

  it("skips commit when last commit is already WIP handoff", async () => {
    mockExeca.mockImplementation((async (cmd: string, args: string[]) => {
      const argStr = Array.isArray(args) ? args.join(" ") : "";
      if (cmd === "git" && argStr.includes("log -1")) {
        return { stdout: "[orchard] WIP handoff" };
      }
      return { stdout: "" };
    }) as unknown as typeof execa);
    mockSshExec.mockResolvedValue("");
    mockRemoveWorktree.mockResolvedValue(undefined);

    await pushToRemote(makeWorktree(), remote, vi.fn());

    // Should NOT have called git add or git commit
    const commitCalls = mockExeca.mock.calls.filter(
      (call) => call[0] === "git" && Array.isArray(call[1]) && call[1].includes("commit"),
    );
    expect(commitCalls).toHaveLength(0);

    const addCalls = mockExeca.mock.calls.filter(
      (call) => call[0] === "git" && Array.isArray(call[1]) && call[1].includes("add"),
    );
    expect(addCalls).toHaveLength(0);
  });

  it("does not tear down local when remote setup fails", async () => {
    // getLastCommitMessage succeeds, git add/commit/push succeed
    mockExeca.mockImplementation((async (cmd: string, args: string[]) => {
      const argStr = Array.isArray(args) ? args.join(" ") : "";
      if (cmd === "git" && argStr.includes("log -1")) {
        return { stdout: "[orchard] WIP handoff" };
      }
      return { stdout: "" };
    }) as unknown as typeof execa);

    // SSH fails on worktree creation AND on the fallback pull
    mockSshExec
      .mockRejectedValueOnce(new Error("worktree add failed"))
      .mockRejectedValueOnce(new Error("pull also failed"));

    await expect(pushToRemote(makeWorktree(), remote, vi.fn())).rejects.toThrow("pull also failed");

    expect(mockKillTmuxSession).not.toHaveBeenCalled();
    expect(mockRemoveWorktree).not.toHaveBeenCalled();
  });

  it("skips killing local session when tmuxSession is null", async () => {
    setupHappyPath();

    await pushToRemote(makeWorktree({ tmuxSession: null }), remote, vi.fn());

    expect(mockKillTmuxSession).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// pullToLocal
// ---------------------------------------------------------------------------

describe("pullToLocal", () => {
  function setupHappyPath(): void {
    mockSshExec.mockResolvedValue("");
    mockExeca.mockResolvedValue({ stdout: "" } as Awaited<ReturnType<typeof execa>>);
    mockKillRemoteTmuxSession.mockResolvedValue(undefined);
    mockRemoveRemoteWorktree.mockResolvedValue(undefined);
  }

  const repoRoot = "/Users/dev/project";

  it("calls all steps in order on happy path", async () => {
    setupHappyPath();

    const steps: string[] = [];
    const onStep = (step: string) => steps.push(step);
    const wt = makeWorktree({ remote: "ubuntu@10.0.3.56" });

    await pullToLocal(wt, remote, repoRoot, onStep);

    expect(steps).toEqual([
      "Committing remote changes...",
      "Pushing from remote...",
      "Fetching locally...",
      "Creating local worktree...",
      "Creating local session...",
      "Cleaning up remote session...",
      "Removing remote worktree...",
    ]);
  });

  it("commits and pushes from remote via SSH", async () => {
    setupHappyPath();

    const wt = makeWorktree();
    await pullToLocal(wt, remote, repoRoot, vi.fn());

    // Remote commit
    expect(mockSshExec).toHaveBeenCalledWith(
      "ubuntu@10.0.3.56",
      expect.stringContaining("git add -u"),
    );

    // Remote push
    expect(mockSshExec).toHaveBeenCalledWith(
      "ubuntu@10.0.3.56",
      expect.stringContaining("git push origin feat/login"),
    );
  });

  it("fetches locally and creates local worktree", async () => {
    setupHappyPath();

    const wt = makeWorktree();
    await pullToLocal(wt, remote, repoRoot, vi.fn());

    expect(mockExeca).toHaveBeenCalledWith("git", ["fetch", "origin", "feat/login"]);
    expect(mockExeca).toHaveBeenCalledWith("git", [
      "worktree",
      "add",
      "/Users/dev/worktrees/worktree-feat-login",
      "origin/feat/login",
    ]);
  });

  it("creates local tmux session", async () => {
    setupHappyPath();

    const wt = makeWorktree();
    await pullToLocal(wt, remote, repoRoot, vi.fn());

    expect(mockExeca).toHaveBeenCalledWith("tmux", [
      "new-session",
      "-d",
      "-s",
      "project:feat-login",
      "-c",
      "/Users/dev/worktrees/worktree-feat-login",
    ]);
  });

  it("tears down remote session and worktree", async () => {
    setupHappyPath();

    const wt = makeWorktree();
    await pullToLocal(wt, remote, repoRoot, vi.fn());

    expect(mockKillRemoteTmuxSession).toHaveBeenCalledWith("ubuntu@10.0.3.56", "feat-login");
    expect(mockRemoveRemoteWorktree).toHaveBeenCalledWith(
      "ubuntu@10.0.3.56",
      "/home/ubuntu/repo",
      "/repo/worktrees/feat-login",
    );
  });

  it("refuses on detached HEAD", async () => {
    const wt = makeWorktree({ branch: null });

    await expect(pullToLocal(wt, remote, repoRoot, vi.fn())).rejects.toThrow("detached HEAD");
    expect(mockSshExec).not.toHaveBeenCalled();
  });

  it("does not tear down remote when local setup fails", async () => {
    mockSshExec.mockResolvedValue("");

    // git fetch succeeds, git worktree add fails, git pull (fallback) also fails
    mockExeca.mockImplementation((async (cmd: string, args: string[]) => {
      const argStr = Array.isArray(args) ? args.join(" ") : "";
      if (cmd === "git" && argStr.includes("fetch")) {
        return { stdout: "" };
      }
      if (cmd === "git" && argStr.includes("worktree add")) {
        throw new Error("worktree add failed");
      }
      if (cmd === "git" && argStr.includes("pull")) {
        throw new Error("pull also failed");
      }
      return { stdout: "" };
    }) as unknown as typeof execa);

    const wt = makeWorktree();

    await expect(pullToLocal(wt, remote, repoRoot, vi.fn())).rejects.toThrow("pull also failed");

    expect(mockKillRemoteTmuxSession).not.toHaveBeenCalled();
    expect(mockRemoveRemoteWorktree).not.toHaveBeenCalled();
  });

  it("skips killing remote session when tmuxSession is null", async () => {
    setupHappyPath();

    const wt = makeWorktree({ tmuxSession: null });
    await pullToLocal(wt, remote, repoRoot, vi.fn());

    expect(mockKillRemoteTmuxSession).not.toHaveBeenCalled();
  });
});
