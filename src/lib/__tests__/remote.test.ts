import { describe, it, expect, vi, afterEach } from "vitest";
import { execa } from "execa";
import type { RemoteConfig } from "../config.js";

vi.mock("execa", () => ({
  execa: vi.fn(),
}));

const mockExeca = vi.mocked(execa);

const remote: RemoteConfig = {
  host: "ubuntu@10.0.3.56",
  repoPath: "~/langwatch/langwatch-bare",
};

describe("listRemoteWorktrees", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function listRemoteWorktrees(r: RemoteConfig) {
    const mod = await import("../remote.js");
    return mod.listRemoteWorktrees(r);
  }

  it("parses remote worktree output and tags with remote host", async () => {
    mockExeca.mockResolvedValue({
      stdout: `worktree /home/ubuntu/repo
HEAD abc123
branch refs/heads/main

worktree /home/ubuntu/worktrees/feat-login
HEAD def456
branch refs/heads/feat/login
`,
    } as Awaited<ReturnType<typeof execa>>);

    const trees = await listRemoteWorktrees(remote);
    expect(trees).toHaveLength(2);
    expect(trees[0]!.remote).toBe("ubuntu@10.0.3.56");
    expect(trees[0]!.branch).toBe("main");
    expect(trees[1]!.remote).toBe("ubuntu@10.0.3.56");
    expect(trees[1]!.branch).toBe("feat/login");
  });

  it("returns empty array on SSH failure", async () => {
    mockExeca.mockRejectedValue(new Error("Connection refused"));

    const trees = await listRemoteWorktrees(remote);
    expect(trees).toEqual([]);
  });

  it("passes correct SSH options", async () => {
    mockExeca.mockResolvedValue({ stdout: "" } as Awaited<ReturnType<typeof execa>>);

    await listRemoteWorktrees(remote);
    expect(mockExeca).toHaveBeenCalledWith("ssh", [
      "-o", "ConnectTimeout=5",
      "-o", "BatchMode=yes",
      "-o", "ControlMaster=auto",
      "-o", "ControlPath=/tmp/orchard-ssh-%r@%h:%p",
      "-o", "ControlPersist=600",
      "ubuntu@10.0.3.56",
      expect.stringContaining("git worktree list --porcelain"),
    ]);
  });
});

describe("listRemoteTmuxSessions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function listRemoteTmuxSessions(r: RemoteConfig) {
    const mod = await import("../remote.js");
    return mod.listRemoteTmuxSessions(r);
  }

  it("parses remote tmux session output", async () => {
    mockExeca.mockResolvedValue({
      stdout: "issue1981\t/home/ubuntu/worktrees/wt-1981\t0\nissue1982\t/home/ubuntu/worktrees/wt-1982\t1\n",
    } as Awaited<ReturnType<typeof execa>>);

    const sessions = await listRemoteTmuxSessions(remote);
    expect(sessions).toHaveLength(2);
    expect(sessions[0]).toEqual({ name: "issue1981", path: "/home/ubuntu/worktrees/wt-1981", attached: false });
    expect(sessions[1]).toEqual({ name: "issue1982", path: "/home/ubuntu/worktrees/wt-1982", attached: true });
  });

  it("returns empty array on SSH failure", async () => {
    mockExeca.mockRejectedValue(new Error("Connection refused"));

    const sessions = await listRemoteTmuxSessions(remote);
    expect(sessions).toEqual([]);
  });
});

describe("removeRemoteWorktree", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function removeRemoteWorktree(...args: Parameters<typeof import("../remote.js")["removeRemoteWorktree"]>) {
    const mod = await import("../remote.js");
    return mod.removeRemoteWorktree(...args);
  }

  it("calls git worktree remove --force via SSH", async () => {
    mockExeca.mockResolvedValueOnce({ stdout: "" } as Awaited<ReturnType<typeof execa>>);

    await removeRemoteWorktree("ubuntu@10.0.3.56", "~/repo", "/home/ubuntu/worktrees/feat");

    expect(mockExeca).toHaveBeenCalledWith("ssh", expect.arrayContaining([
      "cd ~/repo && git worktree remove /home/ubuntu/worktrees/feat --force",
    ]));
  });

  it("falls back to prune and rm -rf when git reports 'is not a working tree'", async () => {
    mockExeca
      .mockRejectedValueOnce(new Error("fatal: '/home/ubuntu/worktrees/feat' is not a working tree"))
      .mockResolvedValueOnce({ stdout: "" } as Awaited<ReturnType<typeof execa>>)
      .mockResolvedValueOnce({ stdout: "" } as Awaited<ReturnType<typeof execa>>);

    await removeRemoteWorktree("ubuntu@10.0.3.56", "~/repo", "/home/ubuntu/worktrees/feat");

    expect(mockExeca).toHaveBeenCalledWith("ssh", expect.arrayContaining([
      "cd ~/repo && git worktree prune",
    ]));
    expect(mockExeca).toHaveBeenCalledWith("ssh", expect.arrayContaining([
      "rm -rf /home/ubuntu/worktrees/feat",
    ]));
  });

  it("re-throws errors that are not 'is not a working tree'", async () => {
    mockExeca.mockRejectedValueOnce(new Error("Connection refused"));

    await expect(
      removeRemoteWorktree("ubuntu@10.0.3.56", "~/repo", "/home/ubuntu/worktrees/feat")
    ).rejects.toThrow("Connection refused");
  });
});

describe("createRemoteSession", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function createRemoteSession(...args: Parameters<typeof import("../remote.js")["createRemoteSession"]>) {
    const mod = await import("../remote.js");
    return mod.createRemoteSession(...args);
  }

  it("creates a tmux session on the remote host in the worktree directory", async () => {
    mockExeca.mockResolvedValueOnce({ stdout: "" } as Awaited<ReturnType<typeof execa>>);

    await createRemoteSession("ubuntu@10.0.3.56", "feat-login", "/home/ubuntu/worktrees/wt-feat");
    expect(mockExeca).toHaveBeenCalledWith("ssh", [
      "-o", "ConnectTimeout=5",
      "-o", "BatchMode=yes",
      "-o", "ControlMaster=auto",
      "-o", "ControlPath=/tmp/orchard-ssh-%r@%h:%p",
      "-o", "ControlPersist=600",
      "ubuntu@10.0.3.56",
      "tmux new-session -d -s feat-login -c /home/ubuntu/worktrees/wt-feat",
    ]);
  });
});

describe("attachRemoteSession", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function attachRemoteSession(...args: Parameters<typeof import("../remote.js")["attachRemoteSession"]>) {
    const mod = await import("../remote.js");
    return mod.attachRemoteSession(...args);
  }

  it("creates a detached local session with ssh and switches to it", async () => {
    // has-session fails (session doesn't exist), new-session + set-option + list-panes + switch-client succeed
    mockExeca
      .mockRejectedValueOnce(new Error("no session"))    // has-session
      .mockResolvedValueOnce({} as Awaited<ReturnType<typeof execa>>)  // new-session
      .mockResolvedValueOnce({} as Awaited<ReturnType<typeof execa>>)  // set-option
      .mockResolvedValueOnce({ stdout: "0" } as Awaited<ReturnType<typeof execa>>)  // list-panes (pane alive)
      .mockResolvedValueOnce({} as Awaited<ReturnType<typeof execa>>);  // switch-client

    await attachRemoteSession("ubuntu@10.0.3.56", "issue1966");
    expect(mockExeca).toHaveBeenCalledWith("tmux", ["has-session", "-t", "remote_issue1966"]);
    expect(mockExeca).toHaveBeenCalledWith("tmux", [
      "new-session", "-d", "-s", "remote_issue1966",
      "ssh", "-tt", "ubuntu@10.0.3.56", "tmux", "attach-session", "-t", "issue1966",
    ]);
    expect(mockExeca).toHaveBeenCalledWith("tmux", ["set-option", "-t", "remote_issue1966", "remain-on-exit", "on"]);
    expect(mockExeca).toHaveBeenCalledWith("tmux", ["list-panes", "-t", "remote_issue1966", "-F", "#{pane_dead}"]);
    expect(mockExeca).toHaveBeenCalledWith("tmux", ["switch-client", "-t", "remote_issue1966"]);
  });

  it("reuses existing local session for ssh", async () => {
    // has-session succeeds (session exists), switch-client succeeds
    mockExeca
      .mockResolvedValueOnce({} as Awaited<ReturnType<typeof execa>>)
      .mockResolvedValueOnce({} as Awaited<ReturnType<typeof execa>>);

    await attachRemoteSession("ubuntu@10.0.3.56", "issue1966");
    expect(mockExeca).toHaveBeenCalledWith("tmux", ["has-session", "-t", "remote_issue1966"]);
    expect(mockExeca).toHaveBeenCalledWith("tmux", ["switch-client", "-t", "remote_issue1966"]);
  });

  it("creates a detached local session with mosh when shell is mosh", async () => {
    mockExeca
      .mockRejectedValueOnce(new Error("no session"))    // has-session
      .mockResolvedValueOnce({} as Awaited<ReturnType<typeof execa>>)  // new-session
      .mockResolvedValueOnce({} as Awaited<ReturnType<typeof execa>>)  // set-option
      .mockResolvedValueOnce({ stdout: "0" } as Awaited<ReturnType<typeof execa>>)  // list-panes
      .mockResolvedValueOnce({} as Awaited<ReturnType<typeof execa>>);  // switch-client

    await attachRemoteSession("ubuntu@10.0.3.56", "issue1966", "mosh");
    expect(mockExeca).toHaveBeenCalledWith("tmux", [
      "new-session", "-d", "-s", "remote_issue1966",
      "env", "LC_ALL=en_US.UTF-8", "mosh", "--predict=always", "ubuntu@10.0.3.56", "--", "tmux", "attach-session", "-t", "issue1966",
    ]);
  });

  it("throws when connection exits immediately (dead pane detected)", async () => {
    mockExeca
      .mockRejectedValueOnce(new Error("no session"))    // has-session
      .mockResolvedValueOnce({} as Awaited<ReturnType<typeof execa>>)  // new-session
      .mockResolvedValueOnce({} as Awaited<ReturnType<typeof execa>>)  // set-option
      .mockResolvedValueOnce({ stdout: "1" } as Awaited<ReturnType<typeof execa>>)  // list-panes (pane dead)
      .mockResolvedValueOnce({ stdout: "Connection refused" } as Awaited<ReturnType<typeof execa>>)  // capture-pane
      .mockResolvedValueOnce({} as Awaited<ReturnType<typeof execa>>);  // kill-session

    await expect(attachRemoteSession("ubuntu@10.0.3.56", "issue1966")).rejects.toThrow(
      "Connection to ubuntu@10.0.3.56 failed"
    );
    expect(mockExeca).toHaveBeenCalledWith("tmux", ["kill-session", "-t", "remote_issue1966"]);
  });

  it("throws when session dies before list-panes check", async () => {
    mockExeca
      .mockRejectedValueOnce(new Error("no session"))    // has-session
      .mockResolvedValueOnce({} as Awaited<ReturnType<typeof execa>>)  // new-session
      .mockResolvedValueOnce({} as Awaited<ReturnType<typeof execa>>)  // set-option
      .mockRejectedValueOnce(new Error("session not found"));  // list-panes fails

    await expect(attachRemoteSession("ubuntu@10.0.3.56", "issue1966")).rejects.toThrow(
      "Session remote_issue1966 died before we could switch to it"
    );
  });

  it("throws and logs on failure", async () => {
    mockExeca.mockRejectedValue(new Error("tmux not running"));

    await expect(attachRemoteSession("host", "sess")).rejects.toThrow("tmux not running");
  });
});

describe("fetchRemoteWorktrees", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function fetchRemoteWorktrees(r: RemoteConfig) {
    const mod = await import("../remote.js");
    return mod.fetchRemoteWorktrees(r);
  }

  it("merges tmux sessions into remote worktrees", async () => {
    let callCount = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockExeca.mockImplementation((async () => {
      callCount++;
      if (callCount <= 1) {
        return { stdout: `worktree /home/ubuntu/worktrees/wt-feat\nHEAD abc123\nbranch refs/heads/feat/login\n` };
      }
      return { stdout: "feat-login\t/home/ubuntu/worktrees/wt-feat\t0\n" };
    }) as any);

    const trees = await fetchRemoteWorktrees(remote);
    expect(trees).toHaveLength(1);
    expect(trees[0]!.tmuxSession).toBe("feat-login");
    expect(trees[0]!.tmuxAttached).toBe(false);
    expect(trees[0]!.remote).toBe("ubuntu@10.0.3.56");
  });
});
