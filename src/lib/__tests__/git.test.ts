import { describe, it, expect } from "vitest";
import { parsePorcelain } from "../git.js";

describe("parsePorcelain", () => {
  it("parses a single worktree with branch", () => {
    const output = `worktree /home/user/project
HEAD abc123def456
branch refs/heads/main
`;
    const result = parsePorcelain(output);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      path: "/home/user/project",
      head: "abc123def456",
      branch: "main",
      isBare: false,
    });
  });

  it("parses a bare worktree", () => {
    const output = `worktree /home/user/project.git
HEAD abc123
bare
`;
    const result = parsePorcelain(output);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      path: "/home/user/project.git",
      isBare: true,
      branch: null,
    });
  });

  it("parses a detached HEAD worktree", () => {
    const output = `worktree /home/user/project-detached
HEAD abc123
detached
`;
    const result = parsePorcelain(output);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      path: "/home/user/project-detached",
      branch: null,
      isBare: false,
    });
  });

  it("parses multiple worktrees", () => {
    const output = `worktree /home/user/project
HEAD abc123
branch refs/heads/main

worktree /home/user/project-feature
HEAD def456
branch refs/heads/feat/login

worktree /home/user/project-fix
HEAD 789abc
branch refs/heads/fix/typo
`;
    const result = parsePorcelain(output);
    expect(result).toHaveLength(3);
    expect(result[0]!.branch).toBe("main");
    expect(result[1]!.branch).toBe("feat/login");
    expect(result[2]!.branch).toBe("fix/typo");
  });

  it("strips refs/heads/ prefix from branch", () => {
    const output = `worktree /home/user/project
HEAD abc123
branch refs/heads/feature/deep/nested/branch
`;
    const result = parsePorcelain(output);
    expect(result[0]!.branch).toBe("feature/deep/nested/branch");
  });

  it("handles empty input", () => {
    const result = parsePorcelain("");
    expect(result).toHaveLength(0);
  });

  it("handles bare + regular worktrees together", () => {
    const output = `worktree /home/user/project.git
HEAD abc123
bare

worktree /home/user/project-main
HEAD def456
branch refs/heads/main
`;
    const result = parsePorcelain(output);
    expect(result).toHaveLength(2);
    expect(result[0]!.isBare).toBe(true);
    expect(result[1]!.isBare).toBe(false);
    expect(result[1]!.branch).toBe("main");
  });

  it("initializes pr and tmux fields as null/false", () => {
    const output = `worktree /home/user/project
HEAD abc123
branch refs/heads/main
`;
    const result = parsePorcelain(output);
    expect(result[0]!.pr).toBeNull();
    expect(result[0]!.prLoading).toBe(false);
    expect(result[0]!.tmuxSession).toBeNull();
    expect(result[0]!.tmuxAttached).toBe(false);
  });
});
