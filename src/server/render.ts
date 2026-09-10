// The public page, rendered as one self-contained HTML document.
//
// Three rules hold this file together, and all three come from what people
// actually complain about with hosted link pages:
//
// 1. **No JavaScript.** The whole page is HTML and inline CSS. A link page is
//    opened from a phone on a social app's in-app browser, and every script is
//    a chance to show a spinner instead of the links.
// 2. **No external requests in the critical path.** No web font, no CSS file,
//    no analytics beacon. Only the avatar, and only if the page has one.
// 3. **Clicks are counted by the server, not by a beacon.** Every link points
//    at /r/<block id>, which records the click and redirects. A blocked script
//    or a fast tap can't lose a count, because there is no script to block.
//
// Brand values arrive as CSS custom properties from the page's `theme` column,
// so a client's colour never becomes a hardcoded value in this file.

import { buttonCss, resolveTheme, type ResolvedTheme, type Theme } from "./theme.js";
import { readSocials, socialIcon, socialLabel } from "./socials.js";

export interface RenderPage {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  hostname: string | null;
  avatar_key: string | null;
  theme: string;
  footer_name: string;
  footer_url: string;
}

export interface RenderBlock {
  id: string;
  kind: string;
  label: string;
  url: string;
  meta: string;
}


/**
 * HTML-escape. Everything interpolated into the document below goes through
 * this, including values the app itself wrote: a page is edited by an agency,
 * filled in on behalf of a client, and served to the public, so no field on
 * the way out is trusted for being ours.
 */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Only http(s) survives. A stored `javascript:` or `data:` URL would otherwise
 * become a script on a page anyone can open, and the redirect at /r/ is the
 * second place this is enforced.
 */
export function safeUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

function embedFrame(url: string): string | null {
  const u = safeUrl(url);
  if (!u) return null;
  const host = new URL(u).hostname.replace(/^www\./, "");
  const path = new URL(u).pathname;
  if (host === "youtube.com" || host === "m.youtube.com") {
    const id = new URL(u).searchParams.get("v");
    if (id) return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`;
  }
  if (host === "youtu.be") {
    const id = path.slice(1);
    if (id) return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`;
  }
  if (host === "open.spotify.com") {
    return `https://open.spotify.com/embed${path}`;
  }
  return null;
}

/**
 * The whole page. Returns a complete HTML document; the caller sets the status
 * and cache headers.
 */
export function renderPage(
  page: RenderPage,
  blocks: RenderBlock[],
  origin: string,
  /** The org's own template, when the page names one that is not built in. */
  custom?: Theme | null,
): string {
  const t = resolveTheme(page.theme, custom);

  const canonical = page.hostname
    ? `https://${page.hostname}/p/${encodeURIComponent(page.slug)}`
    : `${origin}/p/${encodeURIComponent(page.slug)}`;

  const rows = blocks.map((b) => renderBlock(b, origin, page.slug)).filter(Boolean).join("\n");

  const footer = page.footer_name
    ? (() => {
        const href = safeUrl(page.footer_url);
        const name = escapeHtml(page.footer_name);
        return href
          ? `<footer><a href="${escapeHtml(href)}" rel="noopener">${name}</a></footer>`
          : `<footer>${name}</footer>`;
      })()
    : "";

  const avatar = page.avatar_key
    ? `<img class="avatar" src="/m/${encodeURIComponent(page.avatar_key)}" alt="" width="88" height="88">`
    : "";

  const description = page.subtitle || `Links from ${page.title}`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${escapeHtml(page.title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta property="og:type" content="profile">
<meta property="og:title" content="${escapeHtml(page.title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(canonical)}">
<meta name="twitter:card" content="summary">
<style>
${styleSheet(t)}
</style>
</head>
<body>
<main>
${
  // In hero the image is already the canvas, so a second copy of it as a round
  // avatar would be the same picture twice.
  t.header === "hero"
    ? `<header class="hero"><h1>${escapeHtml(page.title)}</h1>${
        page.subtitle ? `<p class="subtitle">${escapeHtml(page.subtitle)}</p>` : ""
      }</header>`
    : `${avatar}<h1>${escapeHtml(page.title)}</h1>${
        page.subtitle ? `<p class="subtitle">${escapeHtml(page.subtitle)}</p>` : ""
      }`
}
<ul>
${rows}
</ul>
${footer}
</main>
</body>
</html>`;
}

function renderBlock(b: RenderBlock, origin: string, slug: string): string {
  const label = escapeHtml(b.label);
  let note = "";
  let thumb = "";
  try {
    const meta = JSON.parse(b.meta) as { note?: string; image?: string };
    if (typeof meta?.note === "string" && meta.note) note = `<span class="note">${escapeHtml(meta.note)}</span>`;
    // The destination's own image, copied into this app's bucket when the row
    // was made, so the page still makes no request to anyone else.
    const key = typeof meta?.image === "string" && /^[\w./-]{1,200}$/.test(meta.image) ? meta.image : null;
    if (key) {
      thumb = `<img class="thumb" src="/m/${encodeURIComponent(key)}" alt="" loading="lazy" decoding="async" width="40" height="40">`;
    }
  } catch {
    // A malformed meta blob costs the note, never the row.
  }

  if (b.kind === "header") return `<li><h2>${label}</h2></li>`;

  if (b.kind === "contact") {
    // The href is the card itself. No script, no modal: the browser downloads
    // a .vcf and the phone opens it in the contacts app, which is the whole
    // interaction a paper card is competing with.
    return `<li><a class="link" href="./${escapeHtml(slug)}/contact.vcf" download>${label}</a></li>`;
  }

  if (b.kind === "socials") {
    const items = readSocials(b.meta);
    if (!items.length) return "";
    // Each one still goes through the counting redirect, so a tap on a social
    // mark is as much yours as a tap on a button.
    const marks = items
      .map(
        (s) =>
          `<li><a class="social" href="/r/${escapeHtml(b.id)}/${escapeHtml(s.p)}" rel="noopener" aria-label="${escapeHtml(socialLabel(s.p))}">${socialIcon(s.p)}</a></li>`,
      )
      .join("");
    return `<li><ul class="socials">${marks}</ul></li>`;
  }

  if (b.kind === "email") {
    return `<li><form method="post" action="/api/public/subscribe">
<input type="hidden" name="block" value="${escapeHtml(b.id)}">
<label class="sr-only" for="email-${escapeHtml(b.id)}">${label}</label>
<input id="email-${escapeHtml(b.id)}" type="email" name="email" required placeholder="${label}" autocomplete="email">
<button type="submit">Sign up</button>
</form></li>`;
  }

  if (b.kind === "embed") {
    const frame = embedFrame(b.url);
    if (!frame) return "";
    return `<li><div class="embed"><iframe src="${escapeHtml(frame)}" loading="lazy" title="${label}" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div></li>`;
  }

  // A link. The href is the redirect, never the destination: that is what makes
  // the click countable without a script. `origin` stays out of it so the link
  // works the same on the custom domain and on the platform subdomain.
  void origin;
  if (!safeUrl(b.url)) return "";
  return `<li><a class="link${thumb ? " has-thumb" : ""}" href="/r/${escapeHtml(b.id)}" rel="noopener">${thumb}<span class="label">${label}${note}</span></a></li>`;
}

/**
 * The page's whole stylesheet, built from the resolved theme. It is inlined in
 * the document rather than served as a file, which is what removes the second
 * request from the critical path.
 */
function styleSheet(t: ResolvedTheme): string {
  // With an image, the scrim is painted as a gradient layer *over* it in the
  // same property, so there is no separate element to get out of sync and the
  // guarantee travels with the background rather than beside it.
  const canvas = t.image
    ? `linear-gradient(rgba(${t.scrim},${t.overlay}),rgba(${t.scrim},${t.overlay})),` +
      `url("/m/${encodeURIComponent(t.image)}") center/cover no-repeat fixed`
    : t.background2
      ? `linear-gradient(${t.angle}deg,${t.background},${t.background2})`
      : t.background;

  return `*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:${canvas};background-attachment:fixed;color:${t.foreground};
  font:400 16px/1.5 ${t.font};
  padding:48px 20px calc(48px + env(safe-area-inset-bottom));
  display:flex;justify-content:center}
main{width:100%;max-width:34rem;text-align:${t.align}}
.avatar{border-radius:${t.avatarRadius};object-fit:cover;margin:0 0 18px;
  ${t.align === "left" ? "" : "display:block;margin-left:auto;margin-right:auto"}}
${t.header === "hero" ? `body{padding-top:0}
main{padding-top:0}
.hero{margin:0 -20px 26px;padding:96px 20px 30px;text-align:${t.align}}
.hero h1{margin-bottom:4px}` : ""}
h1{font-family:${t.headingFont};font-size:${t.header === "hero" ? "1.875rem" : "1.5rem"};font-weight:600;
  letter-spacing:${t.letterSpacing};text-transform:${t.textTransform};margin:0 0 6px}
.subtitle{margin:0 0 28px;opacity:.8;font-size:.9375rem}
ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:12px}
${buttonCss(t)}
a.link:focus-visible{outline:2px solid ${t.accent};outline-offset:3px}
a.link{position:relative}
.thumb{position:absolute;left:12px;top:50%;transform:translateY(-50%);
  width:40px;height:40px;border-radius:calc(${t.corner} - 6px);object-fit:cover}
/* Reserved on both sides, so a centred label stays centred in the row rather
   than being pushed off by the picture. */
a.link.has-thumb{padding-left:62px;padding-right:62px}
.label{line-height:1.35}
.note{display:block;font-weight:400;opacity:.78;font-size:.8125rem;line-height:1.35;margin-top:2px}
h2{font-family:${t.headingFont};font-size:.8125rem;font-weight:600;letter-spacing:.04em;
  text-transform:uppercase;opacity:.55;margin:22px 0 -2px}
.embed{position:relative;padding-top:56.25%;border-radius:${t.corner};overflow:hidden;
  border:1px solid color-mix(in oklab,${t.foreground} 22%,transparent)}
.embed iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
/* The generic list rule stacks rows into a column; this one is a row and has to
   say so, or it inherits the column and lists the marks vertically. */
.socials{display:flex;flex-direction:row;flex-wrap:wrap;gap:12px;justify-content:${t.align === "left" ? "flex-start" : "center"};
  list-style:none;margin:2px 0;padding:0}
a.social{display:grid;place-items:center;width:40px;height:40px;border-radius:999px;color:inherit;
  opacity:.85;transition:opacity .12s ease,background-color .12s ease}
a.social:hover{opacity:1;background:color-mix(in oklab,${t.foreground} 10%,transparent)}
a.social:focus-visible{outline:2px solid ${t.accent};outline-offset:2px}
/* The YouTube notch is a hole in the mark, so it takes the page behind it. */
a.social{--yt-notch:${t.background}}
form{display:flex;gap:8px;flex-wrap:wrap}
input[type=email]{flex:1 1 12rem;padding:14px 16px;border-radius:${t.corner};font:inherit;
  color:inherit;background:color-mix(in oklab,${t.foreground} 6%,transparent);
  border:1px solid color-mix(in oklab,${t.foreground} 22%,transparent)}
input[type=email]::placeholder{color:inherit;opacity:.55}
input[type=email]:focus-visible{outline:2px solid ${t.accent};outline-offset:2px}
button{flex:1 1 7rem;padding:14px 20px;border-radius:${t.corner};border:0;background:${t.accent};
  color:${t.onAccent};font:inherit;font-weight:500;cursor:pointer}
button:focus-visible{outline:2px solid ${t.foreground};outline-offset:2px}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
footer{margin-top:44px;font-size:.8125rem;opacity:.75}
footer a{color:inherit}
@media (prefers-reduced-motion:reduce){a.link{transition:none}
a.link:hover,a.link:active{transform:none}}`;
}
