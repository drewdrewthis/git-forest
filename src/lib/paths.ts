export const HOME_DIR = process.env.HOME || "";

export function tildify(absolutePath: string): string {
  if (!HOME_DIR) return absolutePath;
  return absolutePath.replace(HOME_DIR, "~");
}

export function truncateLeft(path: string, maxWidth: number): string {
  const tildified = tildify(path);
  if (tildified.length <= maxWidth) return tildified;
  return "\u2026" + tildified.slice(-(maxWidth - 1));
}
