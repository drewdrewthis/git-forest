import { describe, it, expect } from "vitest";
import { resolvePrStatus, prStatusDisplay } from "../types.js";
import type { PrInfo, PrStatus } from "../types.js";

const basePr: PrInfo = {
  number: 1,
  state: "open",
  title: "test",
  url: "https://example.com/pr/1",
  reviewDecision: "APPROVED",
  unresolvedThreads: 0,
  checksStatus: "pass",
  hasConflicts: false,
};

describe("resolvePrStatus", () => {
  it("returns merged for merged PR", () => {
    expect(resolvePrStatus({ ...basePr, state: "merged" })).toBe("merged");
  });

  it("returns closed for closed PR", () => {
    expect(resolvePrStatus({ ...basePr, state: "closed" })).toBe("closed");
  });

  it("returns conflict when PR has merge conflicts", () => {
    expect(resolvePrStatus({ ...basePr, hasConflicts: true })).toBe("conflict");
  });

  it("returns conflict over other open PR statuses", () => {
    expect(resolvePrStatus({ ...basePr, hasConflicts: true, checksStatus: "fail", unresolvedThreads: 3 })).toBe("conflict");
  });

  it("returns failing when checks fail", () => {
    expect(resolvePrStatus({ ...basePr, checksStatus: "fail" })).toBe("failing");
  });

  it("returns unresolved over failing checks", () => {
    expect(
      resolvePrStatus({ ...basePr, checksStatus: "fail", unresolvedThreads: 3 })
    ).toBe("unresolved");
  });

  it("returns unresolved when threads exist", () => {
    expect(
      resolvePrStatus({ ...basePr, unresolvedThreads: 2 })
    ).toBe("unresolved");
  });

  it("returns changes_requested over review_needed", () => {
    expect(
      resolvePrStatus({ ...basePr, reviewDecision: "CHANGES_REQUESTED" })
    ).toBe("changes_requested");
  });

  it("returns review_needed for empty review decision", () => {
    expect(
      resolvePrStatus({ ...basePr, reviewDecision: "" })
    ).toBe("review_needed");
  });

  it("returns review_needed for REVIEW_REQUIRED", () => {
    expect(
      resolvePrStatus({ ...basePr, reviewDecision: "REVIEW_REQUIRED" })
    ).toBe("review_needed");
  });

  it("returns pending_ci when approved but checks pending", () => {
    expect(
      resolvePrStatus({ ...basePr, checksStatus: "pending" })
    ).toBe("pending_ci");
  });

  it("returns approved when all green", () => {
    expect(resolvePrStatus(basePr)).toBe("approved");
  });

  it("returns approved when checks have no CI configured", () => {
    expect(
      resolvePrStatus({ ...basePr, checksStatus: "none" })
    ).toBe("approved");
  });
});

describe("prStatusDisplay", () => {
  const allStatuses: PrStatus[] = [
    "conflict", "failing", "unresolved", "changes_requested", "review_needed",
    "pending_ci", "approved", "merged", "closed",
  ];

  it("has an entry for every PrStatus", () => {
    for (const status of allStatuses) {
      expect(prStatusDisplay[status]).toBeDefined();
      expect(prStatusDisplay[status].icon).toBeTruthy();
      expect(prStatusDisplay[status].label).toBeTruthy();
    }
  });

  it("uses distinct labels for each status", () => {
    const labels = allStatuses.map((s) => prStatusDisplay[s].label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
