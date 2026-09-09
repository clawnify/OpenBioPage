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

  const rows = blocks.map((b) => renderBlock(b, origin)).filter(Boolean).join("\n");

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
${avatar}
<h1>${escapeHtml(page.title)}</h1>
${page.subtitle ? `<p class="subtitle">${escapeHtml(page.subtitle)}</p>` : ""}
<ul>
${rows}
</ul>
${footer}
</main>
</body>
</html>`;
}

function renderBlock(b: RenderBlock, origin: string): string {
  const label = escapeHtml(b.label);
  let note = "";
  try {
    const meta = JSON.parse(b.meta) as { note?: string };
    if (typeof meta?.note === "string" && meta.note) note = `<span class="note">${escapeHtml(meta.note)}</span>`;
  } catch {
    // A malformed meta blob costs the note, never the row.
  }

  if (b.kind === "header") return `<li><h2>${label}</h2></li>`;

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
  return `<li><a class="link" href="/r/${escapeHtml(b.id)}" rel="noopener">${label}${note}</a></li>`;
}

/**
 * The page's whole stylesheet, built from the resolved theme. It is inlined in
 * the document rather than served as a file, which is what removes the second
 * request from the critical path.
 */
function styleSheet(t: ResolvedTheme): string {
  const canvas = t.background2
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
h1{font-family:${t.headingFont};font-size:1.5rem;font-weight:600;
  letter-spacing:${t.letterSpacing};text-transform:${t.textTransform};margin:0 0 6px}
.subtitle{margin:0 0 28px;opacity:.8;font-size:.9375rem}
ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:12px}
${buttonCss(t)}
a.link:focus-visible{outline:2px solid ${t.accent};outline-offset:3px}
.note{display:block;font-weight:400;opacity:.78;font-size:.8125rem;margin-top:3px}
h2{font-family:${t.headingFont};font-size:.8125rem;font-weight:600;letter-spacing:.04em;
  text-transform:uppercase;opacity:.55;margin:22px 0 -2px}
.embed{position:relative;padding-top:56.25%;border-radius:${t.corner};overflow:hidden;
  border:1px solid color-mix(in oklab,${t.foreground} 22%,transparent)}
.embed iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
form{display:flex;gap:8px;flex-wrap:wrap}
input[type=email]{flex:1 1 12rem;padding:14px 16px;border-radius:${t.corner};font:inherit;
  color:inherit;background:color-mix(in oklab,${t.foreground} 6%,transparent);
  border:1px solid color-mix(in oklab,${t.foreground} 22%,transparent)}
input[type=email]::placeholder{color:inherit;opacity:.55}
input[type=email]:focus-visible{outline:2px solid ${t.accent};outline-offset:2px}
button{padding:14px 20px;border-radius:${t.corner};border:0;background:${t.accent};
  color:${t.onAccent};font:inherit;font-weight:500;cursor:pointer}
button:focus-visible{outline:2px solid ${t.foreground};outline-offset:2px}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
footer{margin-top:44px;font-size:.8125rem;opacity:.75}
footer a{color:inherit}
@media (prefers-reduced-motion:reduce){a.link{transition:none}
a.link:hover,a.link:active{transform:none}}`;
}
