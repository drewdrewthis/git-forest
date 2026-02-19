import { tmpdir } from "node:os";
import { join } from "node:path";

export const HOME_DIR = process.env.HOME || "";

const uid = process.getuid?.() ?? "default";

export const CD_TARGET_FILE = join(tmpdir(), `git-orchard-cd-target-${uid}`);

export const TMUX_CMD_FILE = join(tmpdir(), `git-orchard-tmux-cmd-${uid}`);

export function tildify(absolutePath: string): string {
  if (!HOME_DIR) return absolutePath;
  return absolutePath.replace(HOME_DIR, "~");
}

export function truncateLeft(path: string, maxWidth: number): string {
  const tildified = tildify(path);
  if (tildified.length <= maxWidth) return tildified;
  return "…" + tildified.slice(-(maxWidth - 1));
}
