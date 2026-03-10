import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractIssueNumber, getIssueStates } from "../github.js";

describe("extractIssueNumber", () => {
  describe("issue-prefixed patterns", () => {
    it("extracts from 'issue1981'", () => {
      expect(extractIssueNumber("issue1981")).toBe(1981);
    });

    it("extracts from 'issue-1981'", () => {
      expect(extractIssueNumber("issue-1981")).toBe(1981);
    });

    it("extracts from 'issue/1981'", () => {
      expect(extractIssueNumber("issue/1981")).toBe(1981);
    });

    it("extracts from 'issue-1981-fix-bug'", () => {
      expect(extractIssueNumber("issue-1981-fix-bug")).toBe(1981);
    });

    it("extracts from 'feat/issue-42' (small number with issue prefix)", () => {
      expect(extractIssueNumber("feat/issue-42")).toBe(42);
    });

    it("is case-insensitive for issue prefix", () => {
      expect(extractIssueNumber("Issue1981")).toBe(1981);
      expect(extractIssueNumber("ISSUE-1981")).toBe(1981);
    });
  });

  describe("leading number patterns", () => {
    it("extracts from '1981-fix-bug'", () => {
      expect(extractIssueNumber("1981-fix-bug")).toBe(1981);
    });

    it("extracts from 'feat/1981-fix-bug'", () => {
      expect(extractIssueNumber("feat/1981-fix-bug")).toBe(1981);
    });

    it("does not match small leading numbers like '42-fix'", () => {
      expect(extractIssueNumber("42-fix")).toBeNull();
    });

    it("extracts from '100-minimal-threshold'", () => {
      expect(extractIssueNumber("100-minimal-threshold")).toBe(100);
    });
  });

  describe("embedded number patterns", () => {
    it("extracts from 'fix-1981'", () => {
      expect(extractIssueNumber("fix-1981")).toBe(1981);
    });

    it("extracts from 'fix-1981-description'", () => {
      expect(extractIssueNumber("fix-1981-description")).toBe(1981);
    });

    it("extracts from 'feat/fix-1981'", () => {
      expect(extractIssueNumber("feat/fix-1981")).toBe(1981);
    });

    it("does not match small embedded numbers like 'fix-42'", () => {
      expect(extractIssueNumber("fix-42")).toBeNull();
    });
  });

  describe("non-matching patterns", () => {
    it("returns null for 'main'", () => {
      expect(extractIssueNumber("main")).toBeNull();
    });

    it("returns null for 'v2'", () => {
      expect(extractIssueNumber("v2")).toBeNull();
    });

    it("returns null for 'feat/add-button'", () => {
      expect(extractIssueNumber("feat/add-button")).toBeNull();
    });

    it("returns null for branch with no numbers", () => {
      expect(extractIssueNumber("feature-branch")).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(extractIssueNumber("")).toBeNull();
    });
  });
});

describe("getIssueStates", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns empty map for empty input", async () => {
    const result = await getIssueStates([]);
    expect(result).toEqual(new Map());
  });

  it("fetches issue states via GraphQL", async () => {
    const mockExeca = vi.fn().mockResolvedValueOnce({
      stdout: JSON.stringify({ owner: { login: "test-owner" }, name: "test-repo" }),
    }).mockResolvedValueOnce({
      stdout: JSON.stringify({
        data: {
          repository: {
            issue0: { number: 1981, state: "CLOSED", stateReason: "NOT_PLANNED" },
            issue1: { number: 1982, state: "OPEN", stateReason: null },
          },
        },
      }),
    });

    vi.doMock("execa", () => ({ execa: mockExeca }));
    const { getIssueStates: getIssueStatesFresh } = await import("../github.js");

    const result = await getIssueStatesFresh([1981, 1982]);

    expect(result.get(1981)).toBe("closed");
    expect(result.get(1982)).toBe("open");
    expect(result.size).toBe(2);
  });

  it("returns 'completed' for issues closed via merged PR", async () => {
    const mockExeca = vi.fn().mockResolvedValueOnce({
      stdout: JSON.stringify({ owner: { login: "test-owner" }, name: "test-repo" }),
    }).mockResolvedValueOnce({
      stdout: JSON.stringify({
        data: {
          repository: {
            issue0: { number: 1849, state: "CLOSED", stateReason: "COMPLETED" },
          },
        },
      }),
    });

    vi.doMock("execa", () => ({ execa: mockExeca }));
    const { getIssueStates: getIssueStatesFresh } = await import("../github.js");

    const result = await getIssueStatesFresh([1849]);

    expect(result.get(1849)).toBe("completed");
  });

  it("returns empty map when GraphQL call fails", async () => {
    const mockExeca = vi.fn().mockResolvedValueOnce({
      stdout: JSON.stringify({ owner: { login: "test-owner" }, name: "test-repo" }),
    }).mockRejectedValueOnce(new Error("network error"));

    vi.doMock("execa", () => ({ execa: mockExeca }));
    const { getIssueStates: getIssueStatesFresh } = await import("../github.js");

    const result = await getIssueStatesFresh([1981]);

    expect(result.size).toBe(0);
  });

  it("handles missing issues in the response", async () => {
    const mockExeca = vi.fn().mockResolvedValueOnce({
      stdout: JSON.stringify({ owner: { login: "test-owner" }, name: "test-repo" }),
    }).mockResolvedValueOnce({
      stdout: JSON.stringify({
        data: {
          repository: {
            issue0: { number: 1981, state: "CLOSED" },
            issue1: null,
          },
        },
      }),
    });

    vi.doMock("execa", () => ({ execa: mockExeca }));
    const { getIssueStates: getIssueStatesFresh } = await import("../github.js");

    const result = await getIssueStatesFresh([1981, 9999]);

    expect(result.get(1981)).toBe("closed");
    expect(result.has(9999)).toBe(false);
  });
});
