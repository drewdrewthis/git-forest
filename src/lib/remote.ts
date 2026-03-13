import { execa } from "execa";
import { log } from "./log.js";
import { parsePorcelain } from "./git.js";
import type { RemoteConfig } from "./config.js";
import type { Worktree } from "./types.js";
import type { TmuxSession } from "./tmux.js";

export async function sshExec(host: string, command: string): Promise<string> {
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
      remote: remote.host,
    }));
    log.info(`remote[${remote.host}]: ${trees.length} worktrees`);
    return trees;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn(`remote[${remote.host}]: failed to list worktrees: ${msg}`);
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
    log.info(`remote[${remote.host}]: ${sessions.length} tmux sessions`);
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
  try {
    await sshExec(host, `cd ${repoPath} && git worktree remove ${worktreePath} --force`);
    log.info(`remote: removed worktree ${worktreePath}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("is not a working tree")) throw err;
    log.warn(`remote: worktree ${worktreePath} not in registry, pruning and removing directory`);
    await sshExec(host, `cd ${repoPath} && git worktree prune`);
    await sshExec(host, `rm -rf ${worktreePath}`);
  }
}

export async function removeRemoteRegistryEntry(host: string, sessionName: string): Promise<void> {
  try {
    await sshExec(host, `rm -f ~/.remmy/sessions/${sessionName}.json`);
    log.info(`remote: removed registry entry ${sessionName}`);
  } catch {
    // registry may not exist, that's fine
  }
}

import type { CancellableCapture } from "./tmux.js";

export function captureRemotePaneContent(host: string, sessionName: string, lines: number): CancellableCapture {
  const subprocess = execa("ssh", [
    "-o", "ConnectTimeout=5",
    "-o", "BatchMode=yes",
    "-o", "ControlMaster=auto",
    "-o", "ControlPath=/tmp/orchard-ssh-%r@%h:%p",
    "-o", "ControlPersist=600",
    host,
    `tmux capture-pane -t ${sessionName} -p -J -e -S ${-lines}`,
  ]);

  const promise = subprocess.then(
    (result) => result.stdout.trimEnd(),
    () => null,
  );

  return { promise, kill: () => subprocess.kill() };
}

export async function createRemoteSession(host: string, sessionName: string, worktreePath: string): Promise<void> {
  try {
    await sshExec(host, `tmux new-session -d -s ${sessionName} -c ${worktreePath}`);
    log.info(`createRemoteSession: created ${sessionName} at ${worktreePath} on ${host}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("duplicate session")) {
      log.info(`createRemoteSession: session ${sessionName} already exists on ${host}, reusing`);
      return;
    }
    throw err;
  }
}

export async function attachRemoteSession(host: string, sessionName: string, shell: "mosh" | "ssh" = "ssh"): Promise<void> {
  const localSession = `remote_${sessionName}`;
  // Use -tt to force PTY allocation — ssh may refuse a single -t when
  // its stdin is not a terminal (which is the case inside tmux new-session -d).
  const remoteCmdArgs = shell === "mosh"
    ? ["env", "LC_ALL=en_US.UTF-8", "mosh", "--predict=always", host, "--", "tmux", "attach-session", "-t", sessionName]
    : ["ssh", "-tt", host, "tmux", "attach-session", "-t", sessionName];
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
      // Keep session alive if SSH exits so the client isn't disrupted
      await execa("tmux", ["set-option", "-t", localSession, "remain-on-exit", "on"]);
      log.info(`attachRemoteSession: created local session ${localSession}`);

      // Brief pause to let the connection start — if it exits immediately
      // (e.g. connection refused, locale error), we want to detect that before switching
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Verify the session command is still running (not just remain-on-exit keeping pane alive)
      try {
        const { stdout } = await execa("tmux", ["list-panes", "-t", localSession, "-F", "#{pane_dead}"]);
        if (stdout.trim() === "1") {
          // Pane is dead — connection exited immediately. Capture output for diagnostics.
          let paneOutput = "";
          try {
            const captured = await execa("tmux", ["capture-pane", "-t", localSession, "-p"]);
            paneOutput = captured.stdout.trim();
          } catch { /* ignore capture errors */ }
          await execa("tmux", ["kill-session", "-t", localSession]);
          const detail = paneOutput ? `\n${paneOutput}` : "";
          throw new Error(`Connection to ${host} failed${detail}`);
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes("Connection to")) throw err;
        // list-panes failed, session probably doesn't exist
        throw new Error(`Session ${localSession} died before we could switch to it`);
      }
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
