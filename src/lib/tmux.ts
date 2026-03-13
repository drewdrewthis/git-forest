import { execa } from "execa";
import { log } from "./log.js";
import { resolvePrStatus, prStatusDisplay } from "./types.js";
import type { PrInfo } from "./types.js";

export interface TmuxSession {
  name: string;
  path: string;
  attached: boolean;
}

export async function listTmuxSessions(): Promise<TmuxSession[]> {
  try {
    const { stdout } = await execa("tmux", [
      "list-sessions",
      "-F",
      "#{session_name}\t#{session_path}\t#{session_attached}",
    ]);

    const sessions = stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [name, path, attached] = line.split("\t");
        return { name: name!, path: path!, attached: attached === "1" };
      });
    log.info(`listTmuxSessions: ${sessions.length} sessions`);
    return sessions;
  } catch {
    // tmux not running or not installed
    return [];
  }
}

export function findSessionForWorktree(
  sessions: TmuxSession[],
  worktreePath: string,
  branch: string | null
): TmuxSession | null {
  // Match by session working directory
  const byPath = sessions.find((s) => s.path === worktreePath);
  if (byPath) return byPath;

  // Match by session name: support both new "repo:branch" format and legacy bare branch/dir names
  const dirName = worktreePath.split("/").pop() || "";
  const branchSlug = branch ? branch.replace(/\//g, "-") : null;
  const byName = sessions.find((s) => {
    // New format: "repo:branch" — extract the suffix after the last ":"
    const colonIdx = s.name.lastIndexOf(":");
    const nameSuffix = colonIdx >= 0 ? s.name.slice(colonIdx + 1) : s.name;
    return (
      s.name === dirName ||
      nameSuffix === dirName ||
      (branch && s.name === branch) ||
      (branchSlug && s.name === branchSlug) ||
      (branchSlug && nameSuffix === branchSlug)
    );
  });
  return byName || null;
}

export async function killTmuxSession(sessionName: string): Promise<void> {
  await execa("tmux", ["kill-session", "-t", sessionName]);
  log.info(`killTmuxSession: ${sessionName}`);
}

/** A capture handle that exposes both the result promise and a kill function. */
export interface CancellableCapture {
  promise: Promise<string | null>;
  kill: () => void;
}

export function capturePaneContent(sessionName: string, lines: number): CancellableCapture {
  const subprocess = execa("tmux", [
    "capture-pane", "-t", sessionName, "-p", "-J", "-e",
    "-S", String(-lines),
  ]);

  const promise = subprocess.then(
    (result) => result.stdout.trimEnd(),
    () => null,
  );

  return { promise, kill: () => subprocess.kill() };
}

/**
 * Derive a tmux session name in the format "repoName:branch" (or "repoName:dirName" for detached HEAD).
 * Uses `:` as the separator between repo name and branch slug.
 */
export function deriveSessionName(
  repoName: string,
  branch: string | null,
  worktreePath: string
): string {
  const suffix = branch
    ? branch.replace(/\//g, "-")
    : worktreePath.split("/").pop() || "orchard";
  return `${repoName}:${suffix}`;
}

export interface SwitchToSessionOptions {
  sessionName: string;
  worktreePath: string;
  branch: string | null;
  pr: PrInfo | null;
}

/**
 * Switch the tmux client to a worktree session, creating it if needed.
 * Configures status bar and popup keybinding on new sessions.
 */
export async function switchToSession(
  opts: SwitchToSessionOptions,
  runner: CommandRunner = execaRunner
): Promise<void> {
  const { sessionName, worktreePath, branch, pr } = opts;

  const exists = await sessionExists(sessionName, runner);

  if (!exists) {
    await runner("tmux", ["new-session", "-d", "-s", sessionName, "-c", worktreePath]);
  }

  await applySessionStyle(sessionName, branch, pr, runner);
  await runner("tmux", ["switch-client", "-t", sessionName]);
  log.info(`switchToSession: ${sessionName} (${exists ? "existing" : "new"})`);
}

export type CommandRunner = (
  cmd: string,
  args: string[]
) => Promise<{ stdout: string }>;

async function sessionExists(
  name: string,
  runner: CommandRunner
): Promise<boolean> {
  try {
    await runner("tmux", ["has-session", "-t", name]);
    return true;
  } catch {
    return false;
  }
}

const CHEATSHEET = "#[fg=colour8]prefix: ctrl-b | o: orchard | (/): prev/next | %%: split-v | \": split-h | arrows: pane | z: zoom | x: close | d: detach";

async function applySessionStyle(
  sessionName: string,
  branch: string | null,
  pr: PrInfo | null,
  runner: CommandRunner
): Promise<void> {
  const statusLeft = formatStatusLeft(branch, pr);
  const t = ["-t", sessionName];

  await Promise.all([
    runner("tmux", ["set-option", ...t, "status", "on"]),
    runner("tmux", ["set-option", ...t, "status-style", "bg=colour235,fg=colour248"]),
    runner("tmux", ["set-option", ...t, "status-left-length", "60"]),
    runner("tmux", ["set-option", ...t, "status-right-length", "150"]),
    runner("tmux", ["set-option", ...t, "status-left", statusLeft]),
    runner("tmux", ["set-option", ...t, "status-right", CHEATSHEET]),
    runner("tmux", ["bind-key", "o", "switch-client", "-t", "orchard"]),
  ]);
}

const execaRunner: CommandRunner = async (cmd, args) => {
  return execa(cmd, args);
};

export function formatStatusLeft(
  branch: string | null,
  pr: PrInfo | null
): string {
  const branchLabel = branch ?? "detached";
  const parts = [`#[fg=colour2,bold] ${branchLabel} #[fg=colour248,nobold]`];

  if (pr) {
    const status = resolvePrStatus(pr);
    const { icon, label } = prStatusDisplay[status];
    parts.push(`PR#${pr.number} ${icon} ${label}`);
  }

  return parts.join(" ");
}

