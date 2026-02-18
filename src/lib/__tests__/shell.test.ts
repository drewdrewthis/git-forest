import { describe, it, expect } from "vitest";
import { getShellFunction, getInitInstructions } from "../shell.js";

describe("getShellFunction", () => {
  const fn = getShellFunction();

  it("strips trailing slash from TMPDIR", () => {
    expect(fn).toContain('tmpbase="${tmpbase%/}"');
  });

  it("uses per-uid temp files", () => {
    expect(fn).toContain("git-forest-cd-target-$uid");
    expect(fn).toContain("git-forest-tmux-cmd-$uid");
  });

  it("cleans up temp files after reading", () => {
    expect(fn).toContain('rm -f "$cdfile" "$tmuxfile"');
  });

  it("uses command prefix to avoid recursion", () => {
    expect(fn).toContain("command git-forest");
  });
});

describe("getInitInstructions", () => {
  it("includes the shell function", () => {
    const instructions = getInitInstructions();
    expect(instructions).toContain("forest()");
    expect(instructions).toContain("command git-forest");
  });

  it("references the correct rc file for zsh", () => {
    const original = process.env.SHELL;
    process.env.SHELL = "/bin/zsh";
    const instructions = getInitInstructions();
    expect(instructions).toContain("~/.zshrc");
    process.env.SHELL = original;
  });
});
