import { describe, it, expect } from "vitest";
import { getShellFunction, getInitInstructions } from "../shell.js";

describe("getShellFunction", () => {
  const fn = getShellFunction();

  it("strips trailing slash from TMPDIR", () => {
    expect(fn).toContain('tmpbase="${tmpbase%/}"');
  });

  it("uses per-uid temp files", () => {
    expect(fn).toContain("git-orchard-cd-target-$uid");
    expect(fn).toContain("git-orchard-tmux-cmd-$uid");
  });

  it("atomically moves files before reading to avoid TOCTOU race", () => {
    expect(fn).toContain('mv "$cdfile" "$cdtmp"');
    expect(fn).toContain('mv "$tmuxfile" "$tmptmp"');
    expect(fn).toContain('rm -f "$cdtmp"');
    expect(fn).toContain('rm -f "$tmptmp"');
  });

  it("uses command prefix to avoid recursion", () => {
    expect(fn).toContain("command git-orchard");
  });

  it("re-launches orchard after tmux detach", () => {
    const lines = fn.split("\n");
    const evalIndex = lines.findIndex((l: string) => l.includes('eval "$tmuxcmd"'));
    expect(lines[evalIndex + 1]?.trim()).toBe("orchard");
  });
});

describe("getInitInstructions", () => {
  it("includes the shell function", () => {
    const instructions = getInitInstructions();
    expect(instructions).toContain("orchard()");
    expect(instructions).toContain("command git-orchard");
  });

  it("references the correct rc file for zsh", () => {
    const original = process.env.SHELL;
    process.env.SHELL = "/bin/zsh";
    const instructions = getInitInstructions();
    expect(instructions).toContain("~/.zshrc");
    process.env.SHELL = original;
  });
});
