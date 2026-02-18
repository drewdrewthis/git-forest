import { describe, it, expect } from "vitest";
import { findSessionForWorktree, type TmuxSession } from "../tmux.js";

const sessions: TmuxSession[] = [
  { name: "main", path: "/home/user/project", attached: true },
  { name: "feat-login", path: "/home/user/project-login", attached: false },
  { name: "fix-typo", path: "/tmp/other", attached: false },
];

describe("findSessionForWorktree", () => {
  it("matches by session path", () => {
    const result = findSessionForWorktree(
      sessions,
      "/home/user/project",
      "main"
    );
    expect(result).toMatchObject({ name: "main", attached: true });
  });

  it("matches by directory name when path doesn't match", () => {
    const result = findSessionForWorktree(
      sessions,
      "/some/other/path/feat-login",
      "something-else"
    );
    expect(result).toMatchObject({ name: "feat-login" });
  });

  it("matches by branch name", () => {
    const result = findSessionForWorktree(
      sessions,
      "/completely/different/path",
      "fix-typo"
    );
    expect(result).toMatchObject({ name: "fix-typo" });
  });

  it("matches branch with slashes converted to dashes", () => {
    const sessionsWithSlash: TmuxSession[] = [
      { name: "feat-login", path: "/tmp/x", attached: false },
    ];
    const result = findSessionForWorktree(
      sessionsWithSlash,
      "/some/path",
      "feat/login"
    );
    expect(result).toMatchObject({ name: "feat-login" });
  });

  it("returns null when no match", () => {
    const result = findSessionForWorktree(
      sessions,
      "/no/match/here",
      "nonexistent-branch"
    );
    expect(result).toBeNull();
  });

  it("returns null for empty sessions list", () => {
    const result = findSessionForWorktree([], "/some/path", "main");
    expect(result).toBeNull();
  });

  it("returns null when branch is null and no path/dir match", () => {
    const result = findSessionForWorktree(
      sessions,
      "/no/match",
      null
    );
    expect(result).toBeNull();
  });

  it("prefers path match over name match", () => {
    const ambiguous: TmuxSession[] = [
      { name: "project", path: "/wrong/path", attached: false },
      { name: "other", path: "/home/user/project", attached: true },
    ];
    const result = findSessionForWorktree(
      ambiguous,
      "/home/user/project",
      "something"
    );
    expect(result).toMatchObject({ name: "other", attached: true });
  });
});
