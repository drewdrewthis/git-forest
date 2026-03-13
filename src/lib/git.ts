import { execaSync, execa } from "execa";
import { resolve, basename } from "node:path";
import { log } from "./log.js";
import type { Worktree } from "./types.js";

function findRepoRoot(): string {
  const { stdout } = execaSync("git", ["rev-parse", "--show-toplevel"]);
  return stdout.trim();
}

/**
 * Returns the directory name of the git repo root (e.g. "git-orchard" from "/Users/USER/workspace/git-orchard").
 */
export function getRepoName(): string {
  return basename(findRepoRoot());
}

function resolveMainWorktreePath(gitDir: string): string {
  try {
    const { stdout } = execaSync("git", ["config", "--get", "core.worktree"], {
      env: { ...process.env, GIT_DIR: gitDir },
    });
    return resolve(gitDir, stdout.trim());
  } catch {
    return gitDir;
  }
}

export function worktreeHasConflicts(worktreePath: string): boolean {
  try {
    const { stdout } = execaSync("git", ["diff", "--name-only", "--diff-filter=U"], { cwd: worktreePath });
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

export function listWorktrees(): Worktree[] {
  const cwd = findRepoRoot();
  const { stdout } = execaSync("git", ["worktree", "list", "--porcelain"], { cwd });
  const trees = parsePorcelain(stdout).map((worktree) => {
    const resolved = worktree.path.includes("/.git/")
      ? { ...worktree, path: resolveMainWorktreePath(worktree.path) }
      : worktree;
    if (!resolved.isBare) {
      return { ...resolved, hasConflicts: worktreeHasConflicts(resolved.path) };
    }
    return resolved;
  });
  log.info(`listWorktrees: ${trees.length} trees`);
  return trees;
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
      worktrees.push({ path, head, branch, isBare, hasConflicts: false, pr: null, prLoading: false, tmuxSession: null, tmuxAttached: false });
    }
  }

  return worktrees;
}

function isKnownWorktree(path: string): boolean {
  try {
    const { stdout } = execaSync("git", ["worktree", "list", "--porcelain"]);
    return stdout.includes(`worktree ${path}`);
  } catch {
    return false;
  }
}

export async function removeWorktree(
  path: string,
  force = false
): Promise<void> {
  const args = ["worktree", "remove", path];
  if (force) args.push("--force");
  try {
    await execa("git", args);
    log.info(`removeWorktree: removed ${path}`);
  } catch {
    // Worktree may be in a broken state (missing .git file).
    // Remove the directory manually and let git prune the metadata.
    const resolved = resolve(path);
    if (!isKnownWorktree(resolved)) {
      throw new Error(`refusing to rm path not listed as a git worktree: ${path}`);
    }
    log.warn(`removeWorktree: git remove failed for ${path}, falling back to rm + prune`);
    await execa("rm", ["-rf", resolved]);
    await execa("git", ["worktree", "prune"]);
    log.info(`removeWorktree: fallback cleanup completed for ${path}`);
  }
}