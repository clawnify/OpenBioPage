// "It rendered" is not the bar for a QR code. A wrong mask or a mis-sized
// version still produces a convincing square that never scans, so the test
// decodes it back with an independent reader and compares payloads.

import { describe, expect, it } from "vitest";
import jsQR from "jsqr";
import { qrMatrix, qrSvg } from "./qr.js";

/** Paint a matrix into an RGBA buffer a decoder can read. */
function raster(matrix: boolean[][], scale = 6, quiet = 4) {
  const n = matrix.length;
  const span = (n + quiet * 2) * scale;
  const data = new Uint8ClampedArray(span * span * 4).fill(255);

  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!matrix[r][c]) continue;
      for (let y = 0; y < scale; y++) {
        for (let x = 0; x < scale; x++) {
          const px = ((r + quiet) * scale + y) * span + ((c + quiet) * scale + x);
          data[px * 4] = 0;
          data[px * 4 + 1] = 0;
          data[px * 4 + 2] = 0;
        }
      }
    }
  }
  return { data, span };
}

const decode = (text: string) => {
  const { data, span } = raster(qrMatrix(text));
  return jsQR(data, span, span)?.data ?? null;
};

describe("a code that actually scans", () => {
  it("round-trips a page URL through an independent reader", () => {
    const url = "https://links.example.com/p/barbieri-ceramics";
    expect(decode(url)).toBe(url);
  });

  it("round-trips a long URL, which forces a bigger version", () => {
    const url = "https://links.example.com/p/barbieri-ceramics?utm_source=business-card&utm_campaign=autumn-market-2026";
    expect(decode(url)).toBe(url);
  });

  it("round-trips a short one, which forces a small version", () => {
    expect(decode("https://a.co")).toBe("https://a.co");
  });

  it("grows the grid as the payload grows, rather than truncating it", () => {
    const small = qrMatrix("https://a.co").length;
    const large = qrMatrix("x".repeat(300)).length;
    expect(large).toBeGreaterThan(small);
  });
});

describe("the svg matches its own matrix", () => {
  const url = "https://links.example.com/p/x";

  it("keeps the four-module quiet zone the spec requires", () => {
    const svg = qrSvg(url);
    const n = qrMatrix(url).length;
    expect(svg).toContain(`viewBox="0 0 ${n + 8} ${n + 8}"`);
  });

  it("draws every dark module exactly once, merged into runs", () => {
    const m = qrMatrix(url);
    const svg = qrSvg(url);

    // Sum the widths of every rect in the dark group; it must equal the number
    // of dark modules, so no module is dropped and none is painted twice.
    const group = svg.slice(svg.indexOf('<g fill='));
    const painted = [...group.matchAll(/width="(\d+)" height="1"/g)].reduce((n, x) => n + Number(x[1]), 0);
    const dark = m.flat().filter(Boolean).length;
    expect(painted).toBe(dark);

    // And it is genuinely merging: far fewer rects than dark modules.
    const rects = [...group.matchAll(/<rect /g)].length;
    expect(rects).toBeLessThan(dark);
  });

  it("is a self-contained document with no external reference", () => {
    const svg = qrSvg(url);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).not.toMatch(/href|url\(|<image/);
  });
});
