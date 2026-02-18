import { tmpdir } from "node:os";
import { join } from "node:path";

export const HOME_DIR = process.env.HOME || "";

export const CD_TARGET_FILE = join(
  tmpdir(),
  `git-forest-cd-target-${process.getuid?.() ?? "default"}`
);

export function tildify(absolutePath: string): string {
  if (!HOME_DIR) return absolutePath;
  return absolutePath.replace(HOME_DIR, "~");
}
