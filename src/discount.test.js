import { describe, it, expect } from "vitest";
import { applyDiscount, MIN_PRICE } from "./discount.js";

describe("applyDiscount", () => {
  it("applies a 20% discount for SAVE20", () => {
    expect(applyDiscount(10, "SAVE20")).toBeCloseTo(8);
    expect(applyDiscount(12.5, "SAVE20")).toBeCloseTo(10);
  });

  it("applies a 50% discount for SAVE50", () => {
    expect(applyDiscount(10, "SAVE50")).toBeCloseTo(5);
  });

  it("applies a 50% discount for HALFOFF", () => {
    expect(applyDiscount(10, "HALFOFF")).toBeCloseTo(5);
  });

  it("returns the original price for unknown codes", () => {
    expect(applyDiscount(10, "NOPE")).toBe(10);
    expect(applyDiscount(10, "constructor")).toBe(10);
  });

  it("matches discount codes case-sensitively", () => {
    expect(applyDiscount(10, "save20")).toBe(10);
  });

  it("allows SAVE20 to discount exactly to the minimum price", () => {
    expect(applyDiscount(1.25, "SAVE20")).toBeCloseTo(MIN_PRICE);
  });

  it("clamps deep discounts to the minimum price", () => {
    expect(applyDiscount(1.2, "SAVE20")).toBe(MIN_PRICE);
    expect(applyDiscount(1.5, "SAVE50")).toBe(MIN_PRICE);
    expect(applyDiscount(1.5, "HALFOFF")).toBe(MIN_PRICE);
  });

  it("keeps prices already at the floor at the minimum price", () => {
    expect(applyDiscount(MIN_PRICE, "SAVE50")).toBe(MIN_PRICE);
  });
});
