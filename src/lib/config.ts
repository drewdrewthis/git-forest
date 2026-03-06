import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execaSync } from "execa";
import { log } from "./log.js";

export interface RemoteConfig {
  name: string;
  host: string;
  repoPath: string;
  shell?: "mosh" | "ssh";
}

export interface OrchardConfig {
  remotes: RemoteConfig[];
}

function findGitDir(): string {
  const { stdout } = execaSync("git", ["rev-parse", "--absolute-git-dir"]);
  return stdout.trim();
}

export function loadConfig(): OrchardConfig {
  try {
    const gitDir = findGitDir();
    const configPath = join(gitDir, "orchard.json");

    if (!existsSync(configPath)) {
      return { remotes: [] };
    }

    const raw = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<OrchardConfig>;

    if (!Array.isArray(parsed.remotes)) {
      return { remotes: [] };
    }

    const remotes = parsed.remotes.filter(
      (r): r is RemoteConfig =>
        typeof r === "object" &&
        r !== null &&
        typeof r.name === "string" &&
        typeof r.host === "string" &&
        typeof r.repoPath === "string"
    );

    log.info(`config: loaded ${remotes.length} remote(s) from ${configPath}`);
    return { remotes };
  } catch {
    return { remotes: [] };
  }
}
