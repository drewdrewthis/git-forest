import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("execa", () => ({
  execa: vi.fn(),
}));

import { handleUpgrade } from "../upgrade.js";
import { execa } from "execa";

const mockedExeca = vi.mocked(execa);

describe("handleUpgrade", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });
  });

  it("runs npm install -g git-orchard@latest", async () => {
    mockedExeca.mockReturnValue(Promise.resolve({}) as never);

    try {
      await handleUpgrade();
    } catch {
      // process.exit mock throws
    }

    expect(mockedExeca).toHaveBeenCalledWith(
      "npm",
      ["install", "-g", "git-orchard@latest"],
      { stdio: "inherit" },
    );
  });

  it("exits with code 0 on success", async () => {
    mockedExeca.mockReturnValue(Promise.resolve({}) as never);

    try {
      await handleUpgrade();
    } catch {
      // process.exit mock throws
    }

    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it("prints the error message on failure", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockedExeca.mockReturnValue(
      Promise.reject(new Error("npm not found")) as never,
    );

    try {
      await handleUpgrade();
    } catch {
      // process.exit mock throws
    }

    expect(consoleSpy).toHaveBeenCalledWith(
      "Upgrade failed:",
      "npm not found",
    );
  });

  it("exits with code 1 on failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockedExeca.mockReturnValue(
      Promise.reject(new Error("npm not found")) as never,
    );

    try {
      await handleUpgrade();
    } catch {
      // process.exit mock throws
    }

    expect(process.exit).toHaveBeenCalledWith(1);
  });
});
