import { describe, it, expect } from "vitest";
import { truncateLeft, tildify } from "../paths.js";

describe("tildify", () => {
  it("replaces HOME with ~", () => {
    const home = process.env.HOME!;
    expect(tildify(`${home}/workspace`)).toBe("~/workspace");
  });

  it("returns path unchanged when HOME is not a prefix", () => {
    expect(tildify("/tmp/something")).toBe("/tmp/something");
  });
});

describe("truncateLeft", () => {
  it("returns full tildified path when it fits", () => {
    const home = process.env.HOME!;
    expect(truncateLeft(`${home}/workspace/foo`, 30)).toBe("~/workspace/foo");
  });

  it("truncates from the left with ellipsis when too long", () => {
    expect(truncateLeft("/a/b/c/d/e/f/long-directory-name", 20)).toBe("…long-directory-name");
  });

  it("truncates to exactly maxWidth characters", () => {
    const result = truncateLeft("/some/very/long/path/that/exceeds/the/limit", 15);
    expect(result.length).toBe(15);
    expect(result.startsWith("…")).toBe(true);
  });

  it("preserves the path end so the meaningful part is visible", () => {
    const result = truncateLeft("/home/user/workspace/langwatch/worktrees/my-feature", 20);
    expect(result.endsWith("my-feature")).toBe(true);
  });
});
