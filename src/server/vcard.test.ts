// Escaping is where a card silently breaks: a stray semicolon splits a value
// into fields the importer then puts in the wrong place, and nothing errors.

import { describe, expect, it } from "vitest";
import { readContact, vcard } from "./vcard.js";

const lines = (s: string) => s.split("\r\n");

describe("building a card", () => {
  it("refuses a card with no name, because there is nothing to save", () => {
    expect(vcard({ email: "a@b.com" })).toBeNull();
    expect(vcard({ name: "   " })).toBeNull();
  });

  it("emits the required opening, version and closing", () => {
    const out = lines(vcard({ name: "Ada Lovelace" })!);
    expect(out[0]).toBe("BEGIN:VCARD");
    expect(out[1]).toBe("VERSION:3.0");
    expect(out.at(-2)).toBe("END:VCARD");
  });

  it("ends every line with CRLF, which some importers require", () => {
    const out = vcard({ name: "Ada" })!;
    expect(out.endsWith("\r\n")).toBe(true);
    expect(out.includes("\n\n")).toBe(false);
    // No bare LF anywhere.
    expect(/[^\r]\n/.test(out)).toBe(false);
  });

  it("escapes the characters that would otherwise split a value", () => {
    // String.raw throughout: a plain literal turns "\;" back into ";" and the
    // expectation quietly agrees with the bug it is meant to catch.
    const out = vcard({ name: "Smith; Jones, Ltd", note: String.raw`back\slash` })!;
    expect(out).toContain(String.raw`FN:Smith\; Jones\, Ltd`);
    expect(out).toContain(String.raw`NOTE:back\\slash`);
  });

  it("turns a newline into an escaped one rather than ending the line", () => {
    const out = vcard({ name: "Ada", address: "12 Long Road\nTrento" })!;
    expect(out).toContain("12 Long Road\\nTrento");
    // The address is still one physical line (before any folding).
    expect(lines(out).filter((l) => l.startsWith("ADR")).length).toBe(1);
  });

  it("does not escape the URL, which would break the link", () => {
    const out = vcard({ name: "Ada", url: "https://example.com/a,b" })!;
    expect(out).toContain("URL:https://example.com/a,b");
  });

  it("puts an undivided name in the family slot rather than guessing a split", () => {
    expect(vcard({ name: "Prince" })!).toContain("N:Prince;;;;");
    expect(vcard({ name: "Ada Lovelace", first: "Ada", last: "Lovelace" })!).toContain("N:Lovelace;Ada;;;");
  });

  it("folds a long line and continues it with a space", () => {
    const out = vcard({ name: "Ada", note: "x".repeat(200) })!;
    const physical = lines(out);
    for (const l of physical) {
      expect(new TextEncoder().encode(l).length, `line too long: ${l.slice(0, 30)}`).toBeLessThanOrEqual(75);
    }
    expect(physical.some((l) => l.startsWith(" "))).toBe(true);
  });

  it("folds on octets, never through the middle of a character", () => {
    // Every one of these is three bytes, so a naive 75-character fold would
    // cut one in half and corrupt the value.
    const out = vcard({ name: "Ada", note: "あ".repeat(80) })!;
    for (const l of lines(out)) {
      expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    }
    // What survives folding must still decode to the original run.
    const rebuilt = out
      .split("\r\n")
      .map((l) => (l.startsWith(" ") ? l.slice(1) : "\n" + l))
      .join("")
      .split("\n")
      .find((l) => l.startsWith("NOTE:"));
    expect(rebuilt).toBe("NOTE:" + "あ".repeat(80));
  });

  it("leaves out every field it was not given", () => {
    const out = vcard({ name: "Ada" })!;
    for (const key of ["ORG", "TITLE", "EMAIL", "TEL", "URL", "ADR", "NOTE"]) {
      expect(out).not.toContain(`${key}:`);
    }
  });
});

describe("reading a stored contact", () => {
  it("treats an unwritten column as an empty card", () => {
    expect(readContact("")).toEqual({});
    expect(readContact("{not json")).toEqual({});
  });
});
