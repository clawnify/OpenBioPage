// Every preset has to be readable. This is the one design rule an author does
// not get to override, and it is the rule most easily broken by eye: the first
// `sunset` looked good in a screenshot and measured 2.32:1.

import { describe, expect, it } from "vitest";
import { PRESETS, readableOn, resolveTheme, scrimFloor } from "./theme.js";

function luminance(hex: string): number {
  const f = hex.replace("#", "");
  const channel = (i: number) => {
    const v = parseInt(f.slice(i * 2, i * 2 + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Text drawn at `alpha` over `bg` is really this colour. */
function flatten(fg: string, bg: string, alpha: number): string {
  const f = fg.replace("#", "");
  const b = bg.replace("#", "");
  const mix = (i: number) =>
    Math.round(parseInt(f.slice(i * 2, i * 2 + 2), 16) * alpha + parseInt(b.slice(i * 2, i * 2 + 2), 16) * (1 - alpha));
  return "#" + [0, 1, 2].map((i) => mix(i).toString(16).padStart(2, "0")).join("");
}

const AA = 4.5;

describe.each(Object.keys(PRESETS))("preset %s", (name) => {
  const t = resolveTheme(JSON.stringify({ preset: name }));
  // A gradient has to be readable at both ends, not on average.
  const canvases = t.background2 ? [t.background, t.background2] : [t.background];

  it("body text clears AA on every part of the canvas", () => {
    for (const canvas of canvases) {
      expect(contrast(t.foreground, canvas), `${name}: body on ${canvas}`).toBeGreaterThanOrEqual(AA);
    }
  });

  it("the subtitle clears AA at its rendered opacity", () => {
    for (const canvas of canvases) {
      const rendered = flatten(t.foreground, canvas, 0.8);
      expect(contrast(rendered, canvas), `${name}: subtitle on ${canvas}`).toBeGreaterThanOrEqual(AA);
    }
  });

  it("button text clears AA on the accent", () => {
    expect(contrast(t.onAccent, t.accent), `${name}: button label`).toBeGreaterThanOrEqual(AA);
  });
});

describe("theme resolution", () => {
  it("lets a page override one field of a preset and keep the rest", () => {
    const t = resolveTheme(JSON.stringify({ preset: "ink", accent: "#2f5bd8" }));
    expect(t.accent).toBe("#2f5bd8");
    expect(t.background).toBe(PRESETS.ink.theme.background);
    expect(t.button).toBe(PRESETS.ink.theme.button);
  });

  it("refuses a colour that is not a colour", () => {
    const t = resolveTheme(JSON.stringify({ background: "url(javascript:alert(1))" }));
    expect(t.background).toBe("#ffffff");
  });

  it("survives a malformed theme without losing the page", () => {
    expect(() => resolveTheme("{not json")).not.toThrow();
    expect(resolveTheme("{not json").background).toBe("#ffffff");
  });

  it("picks the readable text colour for an accent, not a fixed one", () => {
    expect(readableOn("#fdf35e")).toBe("#111111");
    expect(readableOn("#101010")).toBe("#ffffff");
  });
});

describe("a photograph as the canvas", () => {
  /** Text at `alpha` scrim over the worst pixel a photo could supply. */
  function overWorstPixel(text: string, scrim: string, alpha: number, pixel: number): number {
    const s = scrim === "0,0,0" ? 0 : 255;
    const composited = Math.round(s * alpha + pixel * (1 - alpha));
    const hex = "#" + [composited, composited, composited].map((n) => n.toString(16).padStart(2, "0")).join("");
    return contrast(text, hex);
  }

  it("stays legible over a pure white photo and a pure black one", () => {
    for (const name of Object.keys(PRESETS)) {
      const t = resolveTheme(JSON.stringify({ preset: name, header: "hero", image: "x.jpg" }));
      for (const pixel of [0, 255]) {
        const ratio = overWorstPixel(t.foreground, t.scrim, t.overlay, pixel);
        expect(ratio, `${name} over a ${pixel === 0 ? "black" : "white"} photo`).toBeGreaterThanOrEqual(AA);
      }
    }
  });

  it("refuses a scrim lighter than the floor, however the author asks", () => {
    // The page would look fine on the photo they tested and fail on the next.
    const t = resolveTheme(JSON.stringify({ preset: "ink", header: "hero", image: "x.jpg", overlay: 0 }));
    expect(t.overlay).toBeGreaterThanOrEqual(scrimFloor(t.foreground));
  });

  it("lets an author go darker than the floor", () => {
    const t = resolveTheme(JSON.stringify({ preset: "ink", header: "hero", image: "x.jpg", overlay: 0.8 }));
    expect(t.overlay).toBeCloseTo(0.8);
  });

  it("ignores a key that is not a key, so nothing is interpolated into the css", () => {
    const t = resolveTheme(JSON.stringify({ header: "hero", image: 'x.jpg");evil:1;a:url("' }));
    expect(t.image).toBeNull();
    expect(t.header).toBe("classic");
  });

  it("falls back to the classic header when there is no image to be a hero of", () => {
    expect(resolveTheme(JSON.stringify({ preset: "paper", header: "hero" })).header).toBe("classic");
  });
});
