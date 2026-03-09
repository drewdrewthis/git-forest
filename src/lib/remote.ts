import { execa } from "execa";
import { log } from "./log.js";
import { parsePorcelain } from "./git.js";
import type { RemoteConfig } from "./config.js";
import type { Worktree } from "./types.js";
import type { TmuxSession } from "./tmux.js";

async function sshExec(host: string, command: string): Promise<string> {
  const { stdout } = await execa("ssh", [
    "-o", "ConnectTimeout=5",
    "-o", "BatchMode=yes",
    "-o", "ControlMaster=auto",
    "-o", "ControlPath=/tmp/orchard-ssh-%r@%h:%p",
    "-o", "ControlPersist=600",
    host,
    command,
  ]);
  return stdout;
}

export async function listRemoteWorktrees(remote: RemoteConfig): Promise<Worktree[]> {
  try {
    const stdout = await sshExec(
      remote.host,
      `cd ${remote.repoPath} && git worktree list --porcelain`
    );
    const trees = parsePorcelain(stdout).map((tree) => ({
      ...tree,
      remote: remote.name,
    }));
    log.info(`remote[${remote.name}]: ${trees.length} worktrees`);
    return trees;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn(`remote[${remote.name}]: failed to list worktrees: ${msg}`);
    return [];
  }
}

export async function listRemoteTmuxSessions(remote: RemoteConfig): Promise<TmuxSession[]> {
  try {
    const stdout = await sshExec(
      remote.host,
      "tmux list-sessions -F '#{session_name}\t#{session_path}\t#{session_attached}'"
    );
    const sessions = stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [name, path, attached] = line.split("\t");
        return { name: name!, path: path!, attached: attached === "1" };
      });
    log.info(`remote[${remote.name}]: ${sessions.length} tmux sessions`);
    return sessions;
  } catch {
    return [];
  }
}

export async function killRemoteTmuxSession(host: string, sessionName: string): Promise<void> {
  await sshExec(host, `tmux kill-session -t ${sessionName}`);
  log.info(`remote: killed tmux session ${sessionName}`);
}

export async function removeRemoteWorktree(host: string, repoPath: string, worktreePath: string): Promise<void> {
  await sshExec(host, `cd ${repoPath} && git worktree remove ${worktreePath} --force`);
  log.info(`remote: removed worktree ${worktreePath}`);
}

export async function removeRemoteRegistryEntry(host: string, sessionName: string): Promise<void> {
  try {
    await sshExec(host, `rm -f ~/.remmy/sessions/${sessionName}.json`);
    log.info(`remote: removed registry entry ${sessionName}`);
  } catch {
    // registry may not exist, that's fine
  }
}

export async function createRemoteSession(host: string, sessionName: string, worktreePath: string): Promise<void> {
  await sshExec(host, `tmux new-session -d -s ${sessionName} -c ${worktreePath}`);
  log.info(`createRemoteSession: created ${sessionName} at ${worktreePath} on ${host}`);
}

export async function attachRemoteSession(host: string, sessionName: string, shell: "mosh" | "ssh" = "ssh"): Promise<void> {
  const localSession = `remote_${sessionName}`;
  const remoteCmdArgs = shell === "mosh"
    ? ["mosh", host, "--", "tmux", "attach-session", "-t", sessionName]
    : ["ssh", "-t", host, "tmux", "attach-session", "-t", sessionName];
  log.info(`attachRemoteSession: ${remoteCmdArgs.join(" ")}`);
  try {
    let sessionExists = false;
    try {
      await execa("tmux", ["has-session", "-t", localSession]);
      sessionExists = true;
      log.info(`attachRemoteSession: local session ${localSession} already exists`);
    } catch {
      log.info(`attachRemoteSession: creating local session ${localSession}`);
      await execa("tmux", ["new-session", "-d", "-s", localSession, ...remoteCmdArgs]);
      log.info(`attachRemoteSession: created local session ${localSession}`);
    }
    log.info(`attachRemoteSession: switching client to ${localSession} (existed=${sessionExists})`);
    await execa("tmux", ["switch-client", "-t", localSession]);
    log.info(`attachRemoteSession: switch-client done`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error(`attachRemoteSession failed: ${msg}`);
    throw err;
  }
}

export async function fetchRemoteWorktrees(remote: RemoteConfig): Promise<Worktree[]> {
  const [trees, sessions] = await Promise.all([
    listRemoteWorktrees(remote),
    listRemoteTmuxSessions(remote),
  ]);

  return trees.map((tree) => {
    const session = sessions.find(
      (s) =>
        s.path === tree.path ||
        s.name === (tree.path.split("/").pop() || "") ||
        (tree.branch && s.name === tree.branch.replace(/\//g, "-"))
    );
    return {
      ...tree,
      tmuxSession: session?.name ?? null,
      tmuxAttached: session?.attached ?? false,
    };
  });
}
