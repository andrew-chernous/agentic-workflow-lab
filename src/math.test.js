import { describe, it, expect } from "vitest";
import { add } from "./math.js";

describe("add", () => {
  it("sums two numbers", () => {
    expect(add(2, 3)).toBe(5);
  });

  it("handles negative numbers", () => {
    expect(add(-4, 1)).toBe(-3);
  });
});
