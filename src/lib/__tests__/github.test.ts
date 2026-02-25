import { describe, it, expect } from "vitest";
import { deriveChecksStatus } from "../github.js";

describe("deriveChecksStatus", () => {
  it("returns none for empty checks", () => {
    expect(deriveChecksStatus([])).toBe("none");
  });

  it("returns pass when all checks completed successfully", () => {
    const checks = [
      { status: "COMPLETED", conclusion: "SUCCESS" },
      { status: "COMPLETED", conclusion: "SKIPPED" },
      { status: "COMPLETED", conclusion: "NEUTRAL" },
    ];
    expect(deriveChecksStatus(checks)).toBe("pass");
  });

  it("returns fail when any check has FAILURE conclusion", () => {
    const checks = [
      { status: "COMPLETED", conclusion: "SUCCESS" },
      { status: "COMPLETED", conclusion: "FAILURE" },
    ];
    expect(deriveChecksStatus(checks)).toBe("fail");
  });

  it("returns fail when any check has TIMED_OUT conclusion", () => {
    const checks = [
      { status: "COMPLETED", conclusion: "TIMED_OUT" },
    ];
    expect(deriveChecksStatus(checks)).toBe("fail");
  });

  it("returns fail when any check has CANCELLED conclusion", () => {
    const checks = [
      { status: "COMPLETED", conclusion: "CANCELLED" },
    ];
    expect(deriveChecksStatus(checks)).toBe("fail");
  });

  it("returns pending when checks are in progress", () => {
    const checks = [
      { status: "COMPLETED", conclusion: "SUCCESS" },
      { status: "IN_PROGRESS", conclusion: null },
    ];
    expect(deriveChecksStatus(checks)).toBe("pending");
  });

  it("returns fail over pending when failure exists", () => {
    const checks = [
      { status: "IN_PROGRESS", conclusion: null },
      { status: "COMPLETED", conclusion: "FAILURE" },
    ];
    expect(deriveChecksStatus(checks)).toBe("fail");
  });

  it("handles StatusContext nodes with SUCCESS state", () => {
    expect(deriveChecksStatus([{ state: "SUCCESS" }])).toBe("pass");
  });

  it("handles StatusContext nodes with FAILURE state", () => {
    expect(deriveChecksStatus([{ state: "FAILURE" }])).toBe("fail");
  });

  it("handles StatusContext nodes with PENDING state", () => {
    expect(deriveChecksStatus([{ state: "PENDING" }])).toBe("pending");
  });

  it("handles StatusContext nodes with ERROR state", () => {
    expect(deriveChecksStatus([{ state: "ERROR" }])).toBe("fail");
  });

  it("handles mixed CheckRun and StatusContext nodes", () => {
    const checks = [
      { status: "COMPLETED", conclusion: "SUCCESS" },
      { state: "SUCCESS" },
    ];
    expect(deriveChecksStatus(checks)).toBe("pass");
  });
});
