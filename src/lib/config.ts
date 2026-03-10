import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execaSync } from "execa";
import { log } from "./log.js";

export interface RemoteConfig {
  host: string;
  repoPath: string;
  shell?: "mosh" | "ssh";
}

export interface OrchardConfig {
  remote?: RemoteConfig;
}

/** Shape of the legacy config with remotes array. */
interface LegacyRemoteConfig {
  name?: string;
  host: string;
  repoPath: string;
  shell?: "mosh" | "ssh";
}

function findGitDir(): string {
  const { stdout } = execaSync("git", ["rev-parse", "--absolute-git-dir"]);
  return stdout.trim();
}

function isValidRemote(r: unknown): r is LegacyRemoteConfig {
  return (
    typeof r === "object" &&
    r !== null &&
    typeof (r as LegacyRemoteConfig).host === "string" &&
    typeof (r as LegacyRemoteConfig).repoPath === "string"
  );
}

export function loadConfig(): OrchardConfig {
  try {
    const gitDir = findGitDir();
    const configPath = join(gitDir, "orchard.json");

    if (!existsSync(configPath)) {
      return {};
    }

    const raw = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw);

    // New shape: { remote: { host, repoPath } }
    if (parsed.remote && isValidRemote(parsed.remote)) {
      const { host, repoPath, shell } = parsed.remote;
      log.info(`config: loaded remote ${host} from ${configPath}`);
      return { remote: { host, repoPath, shell } };
    }

    // Legacy shape: { remotes: [{ name?, host, repoPath }] }
    if (Array.isArray(parsed.remotes)) {
      const first = parsed.remotes.find(isValidRemote);
      if (first) {
        const { host, repoPath, shell } = first;
        log.info(`config: migrated remote ${host} from ${configPath}`);
        return { remote: { host, repoPath, shell } };
      }
    }

    return {};
  } catch {
    return {};
  }
}
