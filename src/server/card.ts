// The business card, as HTML.
//
// HTML rather than SVG, and that is the whole point. SVG 1.1 has no layout: no
// flex, no text metrics, no wrapping — so an SVG card means estimating how wide
// a name is from its character count and hand-placing every baseline, which is
// guessing dressed up as arithmetic and is wrong the first time someone has a
// wide name in a narrow slot.
//
// Here the browser measures the text. `@page` fixes the sheet at ID-1 portrait
// (54×86mm), so printing this page gives a card at its real physical size with
// no service call and nothing to rasterise.

import { qrSvg } from "./qr.js";
import { readableOn } from "./theme.js";

export interface CardFace {
  name: string;
  /** What the QR points at. */
  url: string;
  background: string;
  title?: string;
  org?: string;
  email?: string;
  phone?: string;
  /**
   * The avatar as a data URI, never a link.
   *
   * A printable file that references an image over the network prints as a
   * blank square the first time it is opened somewhere without that network,
   * which is exactly where a card gets printed.
   */
  avatar?: string;
}

/** The palette the editor offers. */
export const CARD_COLOURS = [
  "#d8f36b", "#1f3a2e", "#e4d3f5", "#1b2a6b", "#e08b4a",
  "#7fd695", "#161b2e", "#c0472f", "#5c1f18", "#4a9cc4",
  "#b44ad0", "#f4f1ea", "#111111",
] as const;

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** A labelled detail row. */
function row(label: string, value: string): string {
  return `<div class="row"><span class="label">${esc(label)}</span><span class="value">${esc(value)}</span></div>`;
}

export function cardHtml(face: CardFace): string {
  const bg = face.background;
  // Computed, so a pale background does not get white type on it just because
  // the last one did.
  const ink = readableOn(bg);
  const muted = ink === "#ffffff" ? "rgba(255,255,255,.66)" : "rgba(0,0,0,.58)";

  // The code always sits on white. A QR in the card's colours is one that
  // scanners have to work at, and this one has a job to do.
  const qr = qrSvg(face.url, { size: 999, dark: "#000000", light: "#ffffff" }).replace(
    /width="\d+" height="\d+"/,
    'width="100%" height="100%"',
  );

  const details = [
    face.email ? row("Email", face.email) : "",
    face.phone ? row("Mobile", face.phone) : "",
  ].join("");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${esc(face.name)}</title>
<style>
  /* The sheet IS the card, so printing needs no scaling and no margins. */
  @page { size: 54mm 86mm; margin: 0 }
  *, *::before, *::after { box-sizing: border-box }
  html, body { margin: 0; padding: 0 }
  body { background: #e9e9e6; display: grid; place-items: center; min-height: 100vh }
  @media print { body { background: none; display: block; min-height: 0 } }

  .card {
    width: 54mm; height: 86mm; border-radius: 4mm; overflow: hidden;
    background: ${bg}; color: ${ink};
    padding: 6mm;
    display: flex; flex-direction: column; gap: 4mm;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  @media print { .card { border-radius: 0 } }

  /* Header: the avatar and the names sit on one cross-axis-centred row, so
     the text is aligned to the picture by the layout rather than by an offset
     someone worked out once and that stops being true at another size. */
  .head { display: flex; align-items: center; gap: 3mm; min-width: 0 }
  .avatar { width: 13mm; height: 13mm; border-radius: 50%; object-fit: cover; flex: none }
  .who { min-width: 0 }
  .org { font-size: 2.1mm; letter-spacing: .08em; text-transform: uppercase; color: ${muted};
         white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
  /* The name shrinks to fit instead of being clipped — the browser measures it. */
  .name { font-size: clamp(3mm, 4.2mm, 4.2mm); font-weight: 600; line-height: 1.15;
          overflow-wrap: anywhere; hyphens: auto }
  .role { font-size: 2.6mm; color: ${muted}; margin-top: .6mm;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis }

  .details { display: flex; flex-direction: column; gap: 2.5mm; min-width: 0 }
  .row { display: flex; flex-direction: column; min-width: 0 }
  .label { font-size: 1.9mm; letter-spacing: .1em; text-transform: uppercase; color: ${muted} }
  .value { font-size: 2.7mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis }

  /* margin-top:auto puts the code at the bottom whatever is above it, and the
     6mm padding gives it the same gutter as everything else. No arithmetic. */
  .code { margin-top: auto; align-self: center; background: #fff; border-radius: 2mm;
          padding: 2mm; width: 30mm; height: 30mm; flex: none }
  .code svg { display: block; width: 100%; height: 100% }
</style></head>
<body><div class="card">
  <div class="head">
    ${face.avatar ? `<img class="avatar" src="${face.avatar}" alt="">` : ""}
    <div class="who">
      ${face.org ? `<div class="org">${esc(face.org)}</div>` : ""}
      <div class="name">${esc(face.name)}</div>
      ${face.title ? `<div class="role">${esc(face.title)}</div>` : ""}
    </div>
  </div>
  ${details ? `<div class="details">${details}</div>` : ""}
  <div class="code">${qr}</div>
</div></body></html>`;
}
