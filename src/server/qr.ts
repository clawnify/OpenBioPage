// The page as a QR code, drawn as SVG.
//
// The encoder is a dependency on purpose. QR is Reed-Solomon error correction,
// version selection and eight candidate mask patterns scored against four
// penalty rules — a hand-rolled one that gets any of that subtly wrong still
// produces a convincing square of noise that simply never scans, and the bug
// surfaces at a conference rather than in a test.
//
// SVG rather than a raster: it prints at any size, it costs no image request,
// and it inherits the page's own colours.

import qrcode from "qrcode-generator";

/** Error correction. M survives a logo or a fold; H is overkill for a URL. */
const LEVEL = "M";

/** Quiet zone, in modules. The spec says four and scanners rely on it. */
const QUIET = 4;

export interface QrOptions {
  /** Rendered edge length in px. The module grid scales to fit it. */
  size?: number;
  dark?: string;
  light?: string;
}

/** The module grid for a payload: `true` is a dark module. */
export function qrMatrix(text: string): boolean[][] {
  // Type 0 asks the library to pick the smallest version that fits.
  const q = qrcode(0, LEVEL);
  q.addData(text);
  q.make();

  const n = q.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => q.isDark(r, c)));
}

/**
 * One `<rect>` per run of dark modules, not per module.
 *
 * A 33×33 code is over a thousand squares drawn individually; merging each
 * horizontal run cuts that by roughly four and leaves the markup legible.
 */
export function qrSvg(text: string, { size = 240, dark = "#000000", light = "#ffffff" }: QrOptions = {}): string {
  const m = qrMatrix(text);
  const n = m.length;
  const span = n + QUIET * 2;

  const runs: string[] = [];
  for (let r = 0; r < n; r++) {
    let start = -1;
    for (let c = 0; c <= n; c++) {
      const on = c < n && m[r][c];
      if (on && start === -1) start = c;
      if (!on && start !== -1) {
        runs.push(`<rect x="${start + QUIET}" y="${r + QUIET}" width="${c - start}" height="1"/>`);
        start = -1;
      }
    }
  }

  // shape-rendering keeps the module edges crisp instead of anti-aliased into
  // grey, which is what makes a small code fail to read.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${span} ${span}" shape-rendering="crispEdges" role="img" aria-label="QR code">
<rect width="${span}" height="${span}" fill="${light}"/>
<g fill="${dark}">${runs.join("")}</g>
</svg>`;
}
