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

  it("returns no remote when config file does not exist", async () => {
    mockExistsSync.mockReturnValue(false);
    const config = await loadConfig();
    expect(config.remote).toBeUndefined();
  });

  it("reads new single-remote config shape", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({
      remote: {
        host: "ubuntu@10.0.3.56",
        repoPath: "/home/ubuntu/repo",
      },
    }));

    const config = await loadConfig();
    expect(config.remote).toEqual({
      host: "ubuntu@10.0.3.56",
      repoPath: "/home/ubuntu/repo",
    });
  });

  it("migrates old remotes array to single remote", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({
      remotes: [{
        name: "ec2",
        host: "ubuntu@10.0.3.56",
        repoPath: "/home/ubuntu/repo",
      }],
    }));

    const config = await loadConfig();
    expect(config.remote).toEqual({
      host: "ubuntu@10.0.3.56",
      repoPath: "/home/ubuntu/repo",
    });
  });

  it("preserves shell option from config", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({
      remote: {
        host: "ubuntu@10.0.3.56",
        repoPath: "/home/ubuntu/repo",
        shell: "mosh",
      },
    }));

    const config = await loadConfig();
    expect(config.remote?.shell).toBe("mosh");
  });

  it("returns no remote when config is empty object", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({}));

    const config = await loadConfig();
    expect(config.remote).toBeUndefined();
  });

  it("filters out invalid remote entries in legacy array", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({
      remotes: [
        { name: "missing-host" },
        null,
        "not-an-object",
        { host: "user@host", repoPath: "~/repo" },
      ],
    }));

    const config = await loadConfig();
    expect(config.remote).toEqual({
      host: "user@host",
      repoPath: "~/repo",
    });
  });

  it("returns no remote when remotes array has no valid entries", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({
      remotes: [null, "not-an-object"],
    }));

    const config = await loadConfig();
    expect(config.remote).toBeUndefined();
  });

  it("returns no remote on JSON parse error", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("not valid json {{{");

    const config = await loadConfig();
    expect(config.remote).toBeUndefined();
  });

  it("reads config from git dir path", async () => {
    mockExecaSync.mockReturnValue({ stdout: "/custom/git/dir" } as ReturnType<typeof execaSync>);
    mockExistsSync.mockReturnValue(false);

    await loadConfig();
    expect(mockExistsSync).toHaveBeenCalledWith("/custom/git/dir/orchard.json");
  });
});
