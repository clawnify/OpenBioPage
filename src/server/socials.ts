// The row of platform marks under the links.
//
// Every glyph here is built from primitives — circles, rounded rectangles,
// strokes, and real letterforms where the mark *is* a letter. None of it is
// recalled path data, because a mis-remembered path does not fail loudly: it
// renders as confident nonsense at 22px and nobody notices until a client does.
//
// The trade is honesty over fidelity. These read as the platform at a glance
// without claiming to be the trademarked mark, and anything that could not be
// drawn accurately from primitives was left out rather than approximated.

export interface Social {
  /** Platform key, also the redirect segment and the click's target. */
  p: string;
  url: string;
}

/** `viewBox` is 24×24 for all of them; `currentColor` carries the theme. */
const GLYPHS: Record<string, { label: string; svg: string }> = {
  instagram: {
    label: "Instagram",
    svg: `<rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="1.8"/>
<circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="1.8"/>
<circle cx="17.2" cy="6.8" r="1.2" fill="currentColor"/>`,
  },
  youtube: {
    label: "YouTube",
    svg: `<rect x="2" y="5" width="20" height="14" rx="4.5" fill="currentColor"/>
<path d="M10 8.8v6.4l5.5-3.2z" fill="var(--yt-notch,#fff)"/>`,
  },
  x: {
    label: "X",
    svg: `<path d="M4.5 4.5l15 15M19.5 4.5l-15 15" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/>`,
  },
  facebook: {
    label: "Facebook",
    svg: `<circle cx="12" cy="12" r="9.2" fill="none" stroke="currentColor" stroke-width="1.8"/>
<text x="12" y="17.2" text-anchor="middle" font-family="Georgia,serif" font-size="13" font-weight="700" fill="currentColor">f</text>`,
  },
  linkedin: {
    label: "LinkedIn",
    svg: `<rect x="3" y="3" width="18" height="18" rx="4" fill="none" stroke="currentColor" stroke-width="1.8"/>
<text x="12" y="16.6" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="9.5" font-weight="700" fill="currentColor">in</text>`,
  },
  spotify: {
    label: "Spotify",
    svg: `<circle cx="12" cy="12" r="9.2" fill="none" stroke="currentColor" stroke-width="1.8"/>
<path d="M7.6 9.4c3-1 6.4-.7 9 .8M8.2 12.4c2.4-.8 5.1-.5 7.3.7M8.8 15.3c1.9-.6 4-.4 5.8.6"
  fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`,
  },
  whatsapp: {
    label: "WhatsApp",
    svg: `<path d="M12 3a9 9 0 00-7.7 13.6L3.2 21l4.5-1.1A9 9 0 1012 3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
<path d="M9.2 8.6c-.3.7-.2 1.7.5 2.7.7 1 1.7 1.7 2.6 2 .7.2 1.3 0 1.6-.5l-1.3-1-.9.5c-.6-.3-1.2-.9-1.5-1.6l.5-.8z" fill="currentColor"/>`,
  },
  email: {
    label: "Email",
    svg: `<rect x="2.8" y="5.2" width="18.4" height="13.6" rx="2.6" fill="none" stroke="currentColor" stroke-width="1.8"/>
<path d="M3.6 7.4L12 13l8.4-5.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`,
  },
  website: {
    label: "Website",
    svg: `<circle cx="12" cy="12" r="9.2" fill="none" stroke="currentColor" stroke-width="1.8"/>
<path d="M3 12h18M12 2.8c2.6 2.6 2.6 15.8 0 18.4M12 2.8c-2.6 2.6-2.6 15.8 0 18.4"
  fill="none" stroke="currentColor" stroke-width="1.6"/>`,
  },
};

export const SOCIAL_KEYS = Object.keys(GLYPHS);

export function socialLabel(p: string): string {
  return GLYPHS[p]?.label ?? p;
}

/** One 24×24 mark, or "" for a platform this app does not draw. */
export function socialIcon(p: string): string {
  const g = GLYPHS[p];
  if (!g) return "";
  return `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">${g.svg}</svg>`;
}

/** Read a socials block's stored list, dropping anything unusable. */
export function readSocials(meta: string): Social[] {
  try {
    const items = (JSON.parse(meta) as { items?: unknown }).items;
    if (!Array.isArray(items)) return [];
    return items
      .filter((i): i is Social => !!i && typeof i === "object" && typeof (i as Social).p === "string")
      .filter((i) => i.p in GLYPHS && typeof i.url === "string" && i.url !== "")
      .slice(0, 12);
  } catch {
    return [];
  }
}
