/**
 * Turns free text into a URL slug: lowercase, Unicode letters and digits kept,
 * everything else collapsed to single dashes. Diacritics are stripped only from
 * Latin letters (café → cafe); for other scripts a combining mark is part of the
 * letter, so stripping it would corrupt the word. Non-string input is coerced so
 * callers never get a throw for a missing title.
 */
export function slugify(input) {
  return String(input)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/(?<=\p{Script=Latin})\p{Mark}+/gu, "")
    .normalize("NFC")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}
