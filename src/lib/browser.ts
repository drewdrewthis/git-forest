import { execa } from "execa";

export function openUrl(url: string): void {
  const cmd = process.platform === "darwin" ? "open" : "xdg-open";
  execa(cmd, [url]).catch(() => {
    // silently fail if no browser available
  });
}
