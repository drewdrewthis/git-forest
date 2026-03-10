import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("execa", () => ({
  execa: vi.fn(),
}));

import { getAllPrs, enrichPrDetails } from "../github.js";
import { execa } from "execa";
import type { PrInfo } from "../types.js";

const mockedExeca = vi.mocked(execa);

describe("getAllPrs", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a map of branch to PrInfo", async () => {
    mockedExeca.mockReturnValue(Promise.resolve({
      stdout: JSON.stringify([
        {
          headRefName: "feat/login",
          number: 42,
          state: "OPEN",
          title: "Add login",
          url: "https://github.com/org/repo/pull/42",
          reviewDecision: "APPROVED",
        },
      ]),
    }) as never);

    const result = await getAllPrs();

    expect(result.size).toBe(1);
    expect(result.get("feat/login")).toMatchObject({
      number: 42,
      state: "open",
      title: "Add login",
      reviewDecision: "APPROVED",
    });
  });

  it("deduplicates by branch name (keeps first)", async () => {
    mockedExeca.mockReturnValue(Promise.resolve({
      stdout: JSON.stringify([
        { headRefName: "main", number: 1, state: "OPEN", title: "First", url: "u1", reviewDecision: "" },
        { headRefName: "main", number: 2, state: "CLOSED", title: "Second", url: "u2", reviewDecision: "" },
      ]),
    }) as never);

    const result = await getAllPrs();

    expect(result.size).toBe(1);
    expect(result.get("main")!.number).toBe(1);
  });

  it("skips PRs with unknown state", async () => {
    mockedExeca.mockReturnValue(Promise.resolve({
      stdout: JSON.stringify([
        { headRefName: "feat", number: 1, state: "DRAFT", title: "Draft", url: "u", reviewDecision: "" },
        { headRefName: "main", number: 2, state: "OPEN", title: "Open", url: "u", reviewDecision: "" },
      ]),
    }) as never);

    const result = await getAllPrs();

    expect(result.size).toBe(1);
    expect(result.has("feat")).toBe(false);
    expect(result.has("main")).toBe(true);
  });

  it("returns empty map on failure", async () => {
    mockedExeca.mockReturnValue(Promise.reject(new Error("gh not found")) as never);

    const result = await getAllPrs();

    expect(result.size).toBe(0);
  });

  it("lowercases state values", async () => {
    mockedExeca.mockReturnValue(Promise.resolve({
      stdout: JSON.stringify([
        { headRefName: "feat", number: 1, state: "MERGED", title: "M", url: "u", reviewDecision: "" },
      ]),
    }) as never);

    const result = await getAllPrs();

    expect(result.get("feat")!.state).toBe("merged");
  });

  it("defaults reviewDecision to empty string when null", async () => {
    mockedExeca.mockReturnValue(Promise.resolve({
      stdout: JSON.stringify([
        { headRefName: "feat", number: 1, state: "OPEN", title: "T", url: "u", reviewDecision: null },
      ]),
    }) as never);

    const result = await getAllPrs();

    expect(result.get("feat")!.reviewDecision).toBe("");
  });
});

describe("enrichPrDetails", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("skips enrichment when no open PRs exist", async () => {
    const prMap = new Map<string, PrInfo>([
      ["main", {
        number: 1, state: "merged", title: "M", url: "u",
        reviewDecision: "", unresolvedThreads: 0, checksStatus: "none", hasConflicts: false,
      }],
    ]);

    mockedExeca.mockClear();
    await enrichPrDetails(prMap);

    // execa should not be called for repo/graphql
    expect(mockedExeca).not.toHaveBeenCalled();
  });

  it("updates unresolvedThreads and checksStatus for open PRs", async () => {
    const prMap = new Map<string, PrInfo>([
      ["feat", {
        number: 42, state: "open", title: "T", url: "u",
        reviewDecision: "APPROVED", unresolvedThreads: 0, checksStatus: "none", hasConflicts: false,
      }],
    ]);

    // First call: getRepo
    mockedExeca.mockReturnValueOnce(Promise.resolve({
      stdout: JSON.stringify({ owner: { login: "org" }, name: "repo" }),
    }) as never);

    // Second call: GraphQL
    mockedExeca.mockReturnValueOnce(Promise.resolve({
      stdout: JSON.stringify({
        data: {
          repository: {
            pr0: {
              number: 42,
              mergeable: "MERGEABLE",
              reviewDecision: "APPROVED",
              reviewThreads: { nodes: [{ isResolved: false }, { isResolved: true }] },
              commits: {
                nodes: [{
                  commit: {
                    statusCheckRollup: {
                      contexts: {
                        nodes: [{ status: "COMPLETED", conclusion: "SUCCESS" }],
                      },
                    },
                  },
                }],
              },
            },
          },
        },
      }),
    }) as never);

    await enrichPrDetails(prMap);

    const pr = prMap.get("feat")!;
    expect(pr.unresolvedThreads).toBe(1);
    expect(pr.checksStatus).toBe("pass");
    expect(pr.hasConflicts).toBe(false);
  });

  it("sets hasConflicts when mergeable is CONFLICTING", async () => {
    const prMap = new Map<string, PrInfo>([
      ["feat", {
        number: 42, state: "open", title: "T", url: "u",
        reviewDecision: "APPROVED", unresolvedThreads: 0, checksStatus: "none", hasConflicts: false,
      }],
    ]);

    mockedExeca.mockReturnValueOnce(Promise.resolve({
      stdout: JSON.stringify({
        data: {
          repository: {
            pr0: {
              number: 42,
              mergeable: "CONFLICTING",
              reviewDecision: "APPROVED",
              reviewThreads: { nodes: [] },
              commits: { nodes: [{ commit: { statusCheckRollup: { contexts: { nodes: [] } } } }] },
            },
          },
        },
      }),
    }) as never);

    await enrichPrDetails(prMap);

    expect(prMap.get("feat")!.hasConflicts).toBe(true);
  });

  it("updates reviewDecision from GraphQL response", async () => {
    const prMap = new Map<string, PrInfo>([
      ["feat", {
        number: 42, state: "open", title: "T", url: "u",
        reviewDecision: "", unresolvedThreads: 0, checksStatus: "none", hasConflicts: false,
      }],
    ]);

    // getRepo is cached from previous test, so only mock the GraphQL call
    mockedExeca.mockReturnValueOnce(Promise.resolve({
      stdout: JSON.stringify({
        data: {
          repository: {
            pr0: {
              number: 42,
              mergeable: "MERGEABLE",
              reviewDecision: "APPROVED",
              reviewThreads: { nodes: [] },
              commits: { nodes: [{ commit: { statusCheckRollup: { contexts: { nodes: [] } } } }] },
            },
          },
        },
      }),
    }) as never);

    await enrichPrDetails(prMap);

    expect(prMap.get("feat")!.reviewDecision).toBe("APPROVED");
  });

  it("silently handles GraphQL failure", async () => {
    const prMap = new Map<string, PrInfo>([
      ["feat", {
        number: 42, state: "open", title: "T", url: "u",
        reviewDecision: "", unresolvedThreads: 0, checksStatus: "none", hasConflicts: false,
      }],
    ]);

    // getRepo fails
    mockedExeca.mockReturnValue(Promise.reject(new Error("network error")) as never);

    await enrichPrDetails(prMap);

    // Defaults preserved
    expect(prMap.get("feat")!.unresolvedThreads).toBe(0);
    expect(prMap.get("feat")!.checksStatus).toBe("none");
  });
});
