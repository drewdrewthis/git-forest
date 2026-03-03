import { describe, it, expect } from "vitest";
import { cursorIndexFromDigit } from "../navigation.js";

describe("cursorIndexFromDigit", () => {
  describe("with valid digit keys", () => {
    it("returns 0 for key '1'", () => {
      expect(cursorIndexFromDigit("1", 5)).toBe(0);
    });

    it("returns 4 for key '5'", () => {
      expect(cursorIndexFromDigit("5", 5)).toBe(4);
    });

    it("returns 8 for key '9' when there are 9 items", () => {
      expect(cursorIndexFromDigit("9", 9)).toBe(8);
    });
  });

  describe("with out-of-range digits", () => {
    it("returns null when digit exceeds item count", () => {
      expect(cursorIndexFromDigit("5", 3)).toBeNull();
    });

    it("returns null for key '1' when list is empty", () => {
      expect(cursorIndexFromDigit("1", 0)).toBeNull();
    });

    it("returns null for key '9' when there are only 2 items", () => {
      expect(cursorIndexFromDigit("9", 2)).toBeNull();
    });
  });

  describe("with non-digit input", () => {
    it("returns null for '0'", () => {
      expect(cursorIndexFromDigit("0", 5)).toBeNull();
    });

    it("returns null for letter keys", () => {
      expect(cursorIndexFromDigit("a", 5)).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(cursorIndexFromDigit("", 5)).toBeNull();
    });
  });
});
