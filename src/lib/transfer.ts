import path from "node:path";
import { basename } from "node:path";
import { execa } from "execa";
import { log } from "./log.js";
import { sshExec } from "./remote.js";
import { killRemoteTmuxSession, removeRemoteWorktree } from "./remote.js";
import { removeWorktree } from "./git.js";
import { killTmuxSession, deriveSessionName } from "./tmux.js";
import type { Worktree } from "./types.js";

/**
 * Replace `/` with `-` and strip all characters except alphanumeric, hyphens,
 * underscores, and dots.
 */
export function sanitizeBranchSlug(branch: string): string {
  return branch
    .replace(/\//g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "");
}

/**
 * Derive the remote worktree path from the repo path and branch.
 * Places worktrees in a sibling `worktrees/` directory.
 */
export function deriveRemoteWorktreePath(repoPath: string, branch: string): string {
  const parent = path.posix.dirname(repoPath);
  const slug = sanitizeBranchSlug(branch);
  return `${parent}/worktrees/worktree-${slug}`;
}

/**
 * Derive the local worktree path from the repo root and branch.
 * Returns a resolved absolute path (no `..` segments).
 */
export function deriveLocalWorktreePath(repoRoot: string, branch: string): string {
  const parent = path.resolve(repoRoot, "..");
  const slug = sanitizeBranchSlug(branch);
  return path.resolve(parent, "worktrees", `worktree-${slug}`);
}

export type StepCallback = (step: string) => void;

/**
 * Transfer a local worktree to a remote machine.
 *
 * Steps: commit WIP, push, create remote worktree + tmux session,
 * then tear down local (only if remote setup succeeded).
 */
export async function pushToRemote(
  worktree: Worktree,
  remote: { host: string; repoPath: string },
  onStep: StepCallback,
): Promise<void> {
  if (worktree.hasConflicts) {
    throw new Error("Cannot transfer worktree with merge conflicts. Resolve conflicts first.");
  }
  if (!worktree.branch) {
    throw new Error("Cannot transfer a detached HEAD worktree.");
  }

  const branch = worktree.branch;
  const cwd = worktree.path;
  const remoteWorktreePath = deriveRemoteWorktreePath(remote.repoPath, branch);
  const sessionName = deriveSessionName(basename(remote.repoPath), branch, remoteWorktreePath);

  // Step 1: Commit WIP (skip if already a WIP handoff commit)
  onStep("Committing changes...");
  const lastMsg = await getLastCommitMessage(cwd);
  if (lastMsg !== "[orchard] WIP handoff") {
    await execa("git", ["add", "-u"], { cwd });
    try {
      await execa("git", ["diff", "--cached", "--quiet"], { cwd });
      // No staged changes — skip commit
    } catch {
      // diff --cached --quiet exits non-zero when there are staged changes
      await execa("git", ["commit", "-m", "[orchard] WIP handoff"], { cwd });
    }
  }

  // Step 2: Push branch
  onStep("Pushing branch...");
  await execa("git", ["push", "-u", "origin", branch], { cwd });

  // Step 3: Create remote worktree (or pull into existing)
  onStep("Creating remote worktree...");
  try {
    await sshExec(
      remote.host,
      `cd ${remote.repoPath} && git fetch origin ${branch} && git worktree add ${remoteWorktreePath} origin/${branch}`,
    );
  } catch {
    // Worktree may already exist — pull instead
    await sshExec(
      remote.host,
      `cd ${remoteWorktreePath} && git pull origin ${branch}`,
    );
  }

  // Step 4: Create remote tmux session
  onStep("Creating remote session...");
  await sshExec(
    remote.host,
    `tmux new-session -d -s ${sessionName} -c ${remoteWorktreePath}`,
  );

  // Teardown: only runs if all setup steps above succeeded
  // Step 5: Kill local tmux session
  onStep("Cleaning up local session...");
  if (worktree.tmuxSession) {
    try {
      await killTmuxSession(worktree.tmuxSession);
    } catch {
      // Swallow — session may not exist
    }
  }

  // Step 6: Remove local worktree
  onStep("Removing local worktree...");
  await removeWorktree(worktree.path, true);

  log.info(`pushToRemote: transferred ${branch} to ${remote.host}`);
}

/**
 * Transfer a remote worktree to the local machine.
 *
 * Steps: commit remote WIP, push from remote, fetch locally,
 * create local worktree + tmux session, then tear down remote
 * (only if local setup succeeded).
 */
export async function pullToLocal(
  worktree: Worktree,
  remote: { host: string; repoPath: string },
  repoRoot: string,
  onStep: StepCallback,
): Promise<void> {
  if (!worktree.branch) {
    throw new Error("Cannot transfer a detached HEAD worktree.");
  }

  const branch = worktree.branch;
  const remoteWorktreePath = worktree.path;
  const localWorktreePath = deriveLocalWorktreePath(repoRoot, branch);
  const sessionName = deriveSessionName(basename(repoRoot), branch, localWorktreePath);

  // Step 1: Commit remote changes
  onStep("Committing remote changes...");
  try {
    await sshExec(
      remote.host,
      `cd ${remoteWorktreePath} && git add -u && (git diff --cached --quiet || git commit -m "[orchard] WIP handoff")`,
    );
  } catch {
    // Swallow errors if clean
  }

  // Step 2: Push from remote
  onStep("Pushing from remote...");
  await sshExec(
    remote.host,
    `cd ${remoteWorktreePath} && git push origin ${branch}`,
  );

  // Step 3: Fetch locally
  onStep("Fetching locally...");
  await execa("git", ["fetch", "origin", branch]);

  // Step 4: Create local worktree (or pull into existing)
  onStep("Creating local worktree...");
  try {
    await execa("git", ["worktree", "add", localWorktreePath, `origin/${branch}`]);
  } catch {
    // Worktree may already exist — pull instead
    await execa("git", ["pull", "origin", branch], { cwd: localWorktreePath });
  }

  // Step 5: Create local tmux session
  onStep("Creating local session...");
  await execa("tmux", ["new-session", "-d", "-s", sessionName, "-c", localWorktreePath]);

  // Teardown: only runs if all setup steps above succeeded
  // Step 6: Kill remote tmux session
  onStep("Cleaning up remote session...");
  if (worktree.tmuxSession) {
    try {
      await killRemoteTmuxSession(remote.host, worktree.tmuxSession);
    } catch {
      // Swallow — session may not exist
    }
  }

  // Step 7: Remove remote worktree
  onStep("Removing remote worktree...");
  await removeRemoteWorktree(remote.host, remote.repoPath, remoteWorktreePath);

  log.info(`pullToLocal: transferred ${branch} from ${remote.host}`);
}

async function getLastCommitMessage(cwd: string): Promise<string> {
  try {
    const { stdout } = await execa("git", ["log", "-1", "--format=%s"], { cwd });
    return stdout.trim();
  } catch {
    return "";
  }
}
