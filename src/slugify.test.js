import { describe, it, expect } from "vitest";
import { slugify } from "./slugify.js";

describe("slugify", () => {
  it("lowercases and hyphenates basic text", () => {
    expect(slugify("Hello, World!")).toBe("hello-world");
  });

  it("trims surrounding whitespace", () => {
    expect(slugify("  Hello World  ")).toBe("hello-world");
  });

  it("collapses multiple separators", () => {
    expect(slugify("foo___bar   baz")).toBe("foo-bar-baz");
  });

  it("removes punctuation at boundaries", () => {
    expect(slugify("---Hello!!")).toBe("hello");
  });

  it("preserves numbers", () => {
    expect(slugify("Version 2.0")).toBe("version-2-0");
  });

  it("removes diacritics", () => {
    expect(slugify("Café déjà vu")).toBe("cafe-deja-vu");
  });

  it("preserves Russian letters", () => {
    expect(slugify("Привет мир")).toBe("привет-мир");
  });

  it("preserves Greek letters with tonos", () => {
    expect(slugify("Καλημέρα κόσμε")).toBe("καλημέρα-κόσμε");
  });

  it("preserves Russian letters with punctuation and numbers", () => {
    expect(slugify("Статья 2026: тест")).toBe("статья-2026-тест");
  });

  it("preserves Russian letters with combining marks", () => {
    expect(slugify("Ёж и чай")).toBe("ёж-и-чай");
  });

  it("returns an empty string for empty, blank, and punctuation-only input", () => {
    expect(slugify("")).toBe("");
    expect(slugify("   ")).toBe("");
    expect(slugify("!!!")).toBe("");
  });
});
