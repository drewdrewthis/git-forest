import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { Box, Text } from "ink";
import { WorktreeRow } from "../WorktreeRow.js";
import type { Worktree } from "../../lib/types.js";

function makeWorktree(overrides: Partial<Worktree> = {}): Worktree {
  return {
    path: "/home/user/project",
    branch: "main",
    head: "abc1234",
    isBare: false,
    pr: null,
    prLoading: false,
    tmuxSession: null,
    tmuxAttached: false,
    ...overrides,
  };
}

const defaultWidths = { pathWidth: 30, branchWidth: 20, tmuxWidth: 25 };

/**
 * Wraps a WorktreeRow with a trailing marker so ink does not strip
 * trailing whitespace from the row. This lets us measure the true
 * rendered width of each row.
 */
function renderRowWithMarker(worktree: Worktree, index = 0) {
  return render(
    React.createElement(
      Box,
      null,
      React.createElement(WorktreeRow, {
        worktree,
        isSelected: false,
        index,
        ...defaultWidths,
      }),
      React.createElement(Text, null, "|"),
    ),
  );
}

describe("WorktreeRow", () => {
  describe("tmux column", () => {
    it("renders tmux session name with stopped indicator when detached", () => {
      const { lastFrame } = render(
        React.createElement(WorktreeRow, {
          worktree: makeWorktree({ tmuxSession: "my-session", tmuxAttached: false }),
          isSelected: false,
          index: 0,
          ...defaultWidths,
        }),
      );
      expect(lastFrame()).toContain("\u25fc tmux:my-session");
    });

    it("renders tmux session name with active indicator when attached", () => {
      const { lastFrame } = render(
        React.createElement(WorktreeRow, {
          worktree: makeWorktree({ tmuxSession: "active", tmuxAttached: true }),
          isSelected: false,
          index: 0,
          ...defaultWidths,
        }),
      );
      expect(lastFrame()).toContain("\u25b6 tmux:active");
    });

    it("does not render tmux text when session is null", () => {
      const { lastFrame } = render(
        React.createElement(WorktreeRow, {
          worktree: makeWorktree({ tmuxSession: null }),
          isSelected: false,
          index: 0,
          ...defaultWidths,
        }),
      );
      expect(lastFrame()).not.toContain("tmux:");
    });

    it("produces the same row width with and without a tmux session", () => {
      const withTmux = renderRowWithMarker(
        makeWorktree({ tmuxSession: "sess", tmuxAttached: false }),
      );
      const withoutTmux = renderRowWithMarker(
        makeWorktree({ tmuxSession: null }),
      );

      const withLen = withTmux.lastFrame()!.length;
      const withoutLen = withoutTmux.lastFrame()!.length;
      expect(withLen).toBe(withoutLen);
    });
  });
});
