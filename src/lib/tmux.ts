import { execa } from "execa";
import { resolvePrStatus } from "./types.js";
import type { PrInfo, PrStatus } from "./types.js";

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

    return stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [name, path, attached] = line.split("\t");
        return { name: name!, path: path!, attached: attached === "1" };
      });
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

  // Match by session name containing the branch name or last dir segment
  const dirName = worktreePath.split("/").pop() || "";
  const byName = sessions.find(
    (s) =>
      s.name === dirName ||
      (branch && s.name === branch) ||
      (branch && s.name === branch.replace(/\//g, "-"))
  );
  return byName || null;
}

export async function killTmuxSession(sessionName: string): Promise<void> {
  await execa("tmux", ["kill-session", "-t", sessionName]);
}

export async function capturePaneContent(sessionName: string, lines: number): Promise<string | null> {
  try {
    const { stdout } = await execa("tmux", [
      "capture-pane", "-t", sessionName, "-p", "-J", "-e",
      "-S", String(-lines),
    ]);
    // Strip trailing blank lines
    return stdout.trimEnd();
  } catch {
    return null;
  }
}

export function deriveSessionName(
  branch: string | null,
  worktreePath: string
): string {
  if (branch) return branch.replace(/\//g, "-");
  return worktreePath.split("/").pop() || "orchard";
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

const CHEATSHEET = "#[fg=colour8]^B o orchard  ^B ( prev  ^B ) next  ^B % vert  ^B \" horiz  ^B \u2190\u2192 pane  ^B z zoom  ^B x close  ^B d detach";

async function applySessionStyle(
  sessionName: string,
  branch: string | null,
  pr: PrInfo | null,
  runner: CommandRunner
): Promise<void> {
  const statusLeft = formatStatusLeft(branch, pr);
  const t = ["-t", sessionName];

  await runner("tmux", ["set-option", ...t, "status", "on"]);
  await runner("tmux", ["set-option", ...t, "status-style", "bg=colour235,fg=colour248"]);
  await runner("tmux", ["set-option", ...t, "status-left-length", "60"]);
  await runner("tmux", ["set-option", ...t, "status-right-length", "120"]);
  await runner("tmux", ["set-option", ...t, "status-left", statusLeft]);
  await runner("tmux", ["set-option", ...t, "status-right", CHEATSHEET]);
  await runner("tmux", ["bind-key", "o", "switch-client", "-t", "orchard"]);
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
    const { icon, label } = tmuxStatusLabels[status];
    parts.push(`PR#${pr.number} ${icon} ${label}`);
  }

  return parts.join(" ");
}

const tmuxStatusLabels: Record<PrStatus, { icon: string; label: string }> = {
  failing:           { icon: "\u2717", label: "failing" },
  unresolved:        { icon: "\u25cf", label: "unresolved" },
  changes_requested: { icon: "\u25cf", label: "changes" },
  review_needed:     { icon: "\u25cb", label: "review" },
  pending_ci:        { icon: "\u25cb", label: "pending" },
  approved:          { icon: "\u2713", label: "ready" },
  merged:            { icon: "\u2713", label: "merged" },
  closed:            { icon: "\u2717", label: "closed" },
};

