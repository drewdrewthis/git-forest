import { execaSync, execa } from "execa";
import type { Worktree } from "./types.js";

export function listWorktrees(): Worktree[] {
  const { stdout } = execaSync("git", ["worktree", "list", "--porcelain"]);
  return parsePorcelain(stdout);
}

export function parsePorcelain(output: string): Worktree[] {
  const worktrees: Worktree[] = [];
  const blocks = output.trim().split("\n\n");

  for (const block of blocks) {
    if (!block.trim()) continue;

    const lines = block.trim().split("\n");
    let path = "";
    let head = "";
    let branch: string | null = null;
    let isBare = false;

    for (const line of lines) {
      if (line.startsWith("worktree ")) {
        path = line.slice("worktree ".length);
      } else if (line.startsWith("HEAD ")) {
        head = line.slice("HEAD ".length);
      } else if (line.startsWith("branch ")) {
        // refs/heads/main -> main
        branch = line.slice("branch ".length).replace("refs/heads/", "");
      } else if (line === "bare") {
        isBare = true;
      } else if (line === "detached") {
        branch = null;
      }
    }

    if (path) {
      worktrees.push({ path, head, branch, isBare, pr: null, prLoading: false, tmuxSession: null, tmuxAttached: false });
    }
  }

  return worktrees;
}

export async function removeWorktree(
  path: string,
  force = false
): Promise<void> {
  const args = ["worktree", "remove", path];
  if (force) args.push("--force", "--force");
  await execa("git", args);
}