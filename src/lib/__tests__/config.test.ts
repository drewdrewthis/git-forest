import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { execaSync } from "execa";

vi.mock("node:fs", () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

vi.mock("execa", () => ({
  execaSync: vi.fn(),
}));

const mockExecaSync = vi.mocked(execaSync);
const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);

describe("loadConfig", () => {
  beforeEach(() => {
    mockExecaSync.mockReturnValue({ stdout: "/home/user/repo/.git" } as ReturnType<typeof execaSync>);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function loadConfig() {
    const mod = await import("../config.js");
    return mod.loadConfig();
  }

  it("returns empty remotes when config file does not exist", async () => {
    mockExistsSync.mockReturnValue(false);
    const config = await loadConfig();
    expect(config).toEqual({ remotes: [] });
  });

  it("parses valid config with one remote", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({
      remotes: [{
        name: "remmy",
        host: "ubuntu@10.0.3.56",
        repoPath: "~/langwatch/langwatch-bare",
      }],
    }));

    const config = await loadConfig();
    expect(config.remotes).toHaveLength(1);
    expect(config.remotes[0]).toEqual({
      name: "remmy",
      host: "ubuntu@10.0.3.56",
      repoPath: "~/langwatch/langwatch-bare",
    });
  });

  it("ignores extra fields in remote entries", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({
      remotes: [{
        name: "remmy",
        host: "ubuntu@10.0.3.56",
        repoPath: "~/repo",
        someExtraField: "ignored",
      }],
    }));

    const config = await loadConfig();
    expect(config.remotes).toHaveLength(1);
    expect(config.remotes[0]!.name).toBe("remmy");
  });

  it("filters out invalid remote entries", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({
      remotes: [
        { name: "valid", host: "user@host", repoPath: "~/repo" },
        { name: "missing-host" },
        null,
        "not-an-object",
        { host: "user@host", repoPath: "~/repo" },
      ],
    }));

    const config = await loadConfig();
    expect(config.remotes).toHaveLength(1);
    expect(config.remotes[0]!.name).toBe("valid");
  });

  it("returns empty remotes when remotes is not an array", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ remotes: "not-an-array" }));

    const config = await loadConfig();
    expect(config).toEqual({ remotes: [] });
  });

  it("returns empty remotes on JSON parse error", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("not valid json {{{");

    const config = await loadConfig();
    expect(config).toEqual({ remotes: [] });
  });

  it("reads config from git dir path", async () => {
    mockExecaSync.mockReturnValue({ stdout: "/custom/git/dir" } as ReturnType<typeof execaSync>);
    mockExistsSync.mockReturnValue(false);

    await loadConfig();
    expect(mockExistsSync).toHaveBeenCalledWith("/custom/git/dir/orchard.json");
  });
});
