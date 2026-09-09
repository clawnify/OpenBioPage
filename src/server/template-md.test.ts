// The round trip is the feature: download, hand to an editor, upload back.
// What matters is that an edit to one half never destroys the other.

import { describe, expect, it } from "vitest";
import { parseTemplateMd, safeSlug, toTemplateMd } from "./template-md.js";
import { PRESETS, resolveTheme } from "./theme.js";

const parsed = (md: string) => {
  const r = parseTemplateMd(md);
  if ("error" in r) throw new Error(r.error);
  return r;
};

describe("markdown round trip", () => {
  it("carries every field of a built-in through markdown and back", () => {
    // `sunset` is the hard case: a gradient, an angle, and a numeric field.
    const md = toTemplateMd("sunset", PRESETS.sunset).replace("slug: sunset", "slug: house-sunset");
    const back = parsed(md);

    expect(back.theme).toEqual(PRESETS.sunset.theme);
    expect(back.name).toBe(PRESETS.sunset.name);
    expect(back.tagline).toBe(PRESETS.sunset.tagline);
  });

  it("keeps the prose an editor wrote", () => {
    const md = toTemplateMd("paper", PRESETS.paper).replace("slug: paper", "slug: client-paper");
    expect(parsed(md).notes).toContain("The buttons never fill");
  });

  it("does not accumulate the heading on repeated round trips", () => {
    const first = parsed(toTemplateMd("mono", PRESETS.mono).replace("slug: mono", "slug: a"));
    const second = parsed(toTemplateMd("a", { ...first, theme: first.theme }));
    expect(second.notes).toBe(first.notes);
  });

  it("takes an edit to the fields without touching the prose", () => {
    const md = toTemplateMd("slate", PRESETS.slate)
      .replace("slug: slate", "slug: client-slate")
      .replace('accent: "#2f5bd8"', 'accent: "#b3261e"');
    const back = parsed(md);
    expect(back.theme.accent).toBe("#b3261e");
    expect(back.notes).toContain("The accent is the only colour");
  });

  it("quotes colours, so the hex is not read as a comment", () => {
    expect(toTemplateMd("ink", PRESETS.ink)).toContain('background: "#0e0e0f"');
  });
});

describe("reading what an editor sends back", () => {
  it("ignores a key the editor invented rather than refusing the file", () => {
    const back = parsed(`---\nslug: x\nname: X\nvibe: playful\naccent: "#112233"\n---\n\nprose`);
    expect(back.theme.accent).toBe("#112233");
  });

  it("refuses a document with no frontmatter", () => {
    expect(parseTemplateMd("# Just prose")).toEqual({ error: expect.stringContaining("frontmatter") });
  });

  it("refuses to shadow a built-in", () => {
    const r = parseTemplateMd(`---\nslug: paper\nname: Mine\n---\n`);
    expect(r).toEqual({ error: expect.stringContaining("built-in") });
  });

  it("falls back to the name when there is no slug", () => {
    expect(parsed(`---\nname: Client Brand\n---\n`).slug).toBe("client-brand");
  });

  it("drops a colour that is not a colour, at render time", () => {
    const back = parsed(`---\nslug: x\nname: X\nbackground: url(javascript:alert(1))\n---\n`);
    // The parser stores what it was given; the renderer is the trust boundary.
    expect(resolveTheme("{}", back.theme).background).toBe("#ffffff");
  });
});

describe("safeSlug", () => {
  it("keeps a slug usable as a path segment and a lookup key", () => {
    expect(safeSlug("  Client Brand!! ")).toBe("client-brand");
    expect(safeSlug("../../etc/passwd")).toBe("etc-passwd");
  });
});
