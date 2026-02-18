import { execa } from "execa";

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

export function getTmuxCommand(
  worktreePath: string,
  sessionName: string,
  existingSession: string | null
): string {
  if (existingSession) {
    return `tmux attach-session -t ${shellEscape(existingSession)}`;
  }
  return `tmux new-session -s ${shellEscape(sessionName)} -c ${shellEscape(worktreePath)}`;
}

function shellEscape(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}
