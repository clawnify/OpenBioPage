// The look of a public page.
//
// Taste is the purchase decision in this category: people leave a hosted link
// page because it is "busy, colorful and decorated" against their own minimal
// work, or because someone else's is prettier. Five colour knobs do not answer
// that, so a page picks a **preset** — a whole look someone chose on purpose —
// and overrides individual fields from there.
//
// Every preset is built from the same primitives and none of them costs a
// network request: system font stacks rather than a web font, CSS gradients
// rather than an image, and colour arithmetic done here rather than in a
// stylesheet the browser has to fetch. The page still paints on the first
// frame, which is the whole reason the public renderer has no JavaScript.

export type ButtonStyle = "fill" | "outline" | "soft" | "shadow";
export type Corner = "sharp" | "round" | "pill";
export type FontKey = "sans" | "serif" | "mono" | "rounded" | "condensed";
export type AvatarShape = "circle" | "rounded" | "square";

export interface Theme {
  preset?: string;
  background?: string;
  background2?: string;
  /** Gradient angle in degrees. Ignored unless background2 is set. */
  angle?: number;
  foreground?: string;
  accent?: string;
  font?: FontKey;
  button?: ButtonStyle;
  corner?: Corner;
  avatar?: AvatarShape;
  align?: "center" | "left";
}

/** Resolved, every field present, every value already validated. */
export interface ResolvedTheme {
  background: string;
  background2: string | null;
  angle: number;
  foreground: string;
  accent: string;
  /** Black or white, whichever is readable on `accent`. Never author-supplied. */
  onAccent: string;
  font: string;
  headingFont: string;
  button: ButtonStyle;
  corner: string;
  avatarRadius: string;
  align: "center" | "left";
  letterSpacing: string;
  textTransform: string;
}

// System stacks only. A web font is the single largest thing a link page can
// wait on, and these cover the range people actually ask for.
const FONTS: Record<FontKey, { body: string; heading: string; tracking: string; transform: string }> = {
  sans: {
    body: `-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif`,
    heading: `-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif`,
    tracking: "-.01em",
    transform: "none",
  },
  serif: {
    body: `"Iowan Old Style","Palatino Linotype",Palatino,Georgia,"Times New Roman",serif`,
    heading: `"Iowan Old Style","Palatino Linotype",Palatino,Georgia,"Times New Roman",serif`,
    tracking: "0",
    transform: "none",
  },
  mono: {
    body: `ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace`,
    heading: `ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace`,
    tracking: "-.02em",
    transform: "none",
  },
  rounded: {
    body: `ui-rounded,"SF Pro Rounded","Hiragino Maru Gothic ProN",Quicksand,Verdana,sans-serif`,
    heading: `ui-rounded,"SF Pro Rounded","Hiragino Maru Gothic ProN",Quicksand,Verdana,sans-serif`,
    tracking: "0",
    transform: "none",
  },
  condensed: {
    body: `"Helvetica Neue",Helvetica,Arial,sans-serif`,
    heading: `"Haettenschweiler","Arial Narrow Bold","Helvetica Neue Condensed",Impact,sans-serif`,
    tracking: ".01em",
    transform: "uppercase",
  },
};

const CORNERS: Record<Corner, string> = { sharp: "0px", round: "12px", pill: "999px" };
const AVATARS: Record<AvatarShape, string> = { circle: "50%", rounded: "22%", square: "0" };

/**
 * The presets. Each one is a position, not a palette: someone who wants the
 * page to disappear picks `mono`, someone selling to teenagers picks `candy`.
 * Adding one is adding a row here and nothing else.
 */
export const PRESETS: Record<string, Theme> = {
  // The designer's page. White, hairline outlines, nothing decorative.
  mono: { background: "#ffffff", foreground: "#111111", accent: "#111111", font: "mono", button: "outline", corner: "sharp", avatar: "square" },
  // Ink. Reads expensive, works for photographers and studios.
  ink: { background: "#0e0e0f", foreground: "#f4f3f1", accent: "#f4f3f1", font: "sans", button: "soft", corner: "round", avatar: "circle" },
  // Warm paper and a serif. Bookshops, writers, restaurants.
  paper: { background: "#f6f1e7", foreground: "#2b2622", accent: "#7a5c3e", font: "serif", button: "outline", corner: "round", avatar: "circle" },
  // A gradient and white pills. The look most creators actually want. The stops
  // are darker than a sunset "should" be for one reason: at #ff8a5b the white
  // text measured 2.32:1, which looks fine in a screenshot and is unreadable to
  // anyone who needs the contrast. Both stops now clear 4.5:1.
  sunset: { background: "#a83a2f", background2: "#8c1d4e", angle: 160, foreground: "#ffffff", accent: "#ffffff", font: "rounded", button: "fill", corner: "pill", avatar: "circle" },
  // Hard offset shadows, no blur. Loud on purpose.
  brutal: { background: "#fdf35e", foreground: "#101010", accent: "#101010", font: "condensed", button: "shadow", corner: "sharp", avatar: "square" },
  // Cool and quiet. Consultants, B2B, anyone who wants to look calm.
  slate: { background: "#eef1f4", foreground: "#1d2430", accent: "#2f5bd8", font: "sans", button: "soft", corner: "round", avatar: "rounded" },
  // Soft pastels and full pills.
  candy: { background: "#fff0f6", background2: "#e7f0ff", angle: 200, foreground: "#3a2b3f", accent: "#e0559a", font: "rounded", button: "fill", corner: "pill", avatar: "circle" },
  // Deep green, gold accent. Hospitality.
  forest: { background: "#12241c", foreground: "#eef3ee", accent: "#c9a961", font: "serif", button: "outline", corner: "round", avatar: "circle" },
};

export const PRESET_NAMES = Object.keys(PRESETS);

/** A CSS colour we are willing to inline: hex, rgb()/hsl(), or a bare keyword. */
function safeColor(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (/^#[0-9a-f]{3,8}$/i.test(v)) return v;
  if (/^(rgb|hsl)a?\([0-9.,%\s/-]+\)$/i.test(v)) return v;
  if (/^[a-z]{3,20}$/i.test(v)) return v;
  return null;
}

/**
 * Relative luminance, so button text is legible on whatever accent someone
 * picked. This is the one design decision an author does not get to make: a
 * page is unusable if its buttons read white-on-yellow, and nobody choosing a
 * brand colour is thinking about contrast.
 *
 * Only hex is measurable here. Anything else falls back to white, which is the
 * safer half of the pair for the mid-to-dark colours people choose as accents.
 */
export function readableOn(color: string): string {
  const hex = color.trim();
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#ffffff";

  const full = m[1].length === 3 ? m[1].split("").map((ch) => ch + ch).join("") : m[1];
  const channel = (i: number) => {
    const v = parseInt(full.slice(i * 2, i * 2 + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);

  // Contrast against white vs against black, higher wins.
  return (1.05 / (luminance + 0.05)) >= ((luminance + 0.05) / 0.05) ? "#ffffff" : "#111111";
}

const pick = <T extends string>(raw: unknown, allowed: Record<T, unknown>, fallback: T): T =>
  typeof raw === "string" && raw in allowed ? (raw as T) : fallback;

/**
 * Merge: preset first, then the page's own fields, then the defaults for
 * anything still missing. An author who names a preset and one colour gets the
 * preset with that colour, which is the edit people actually make.
 */
export function resolveTheme(raw: string): ResolvedTheme {
  let theme: Theme = {};
  try {
    const parsed = JSON.parse(raw) as Theme;
    if (parsed && typeof parsed === "object") theme = parsed;
  } catch {
    // A malformed theme costs the look, never the page.
  }

  const base = (theme.preset && PRESETS[theme.preset]) || {};
  const t: Theme = { ...base, ...theme };

  const font = FONTS[pick<FontKey>(t.font, FONTS, "sans")];
  const accent = safeColor(t.accent) ?? "#1b1a19";
  const background2 = safeColor(t.background2);

  return {
    background: safeColor(t.background) ?? "#ffffff",
    background2,
    angle: Number.isFinite(t.angle) ? Math.max(0, Math.min(360, Number(t.angle))) : 160,
    foreground: safeColor(t.foreground) ?? "#1b1a19",
    accent,
    onAccent: readableOn(accent),
    font: font.body,
    headingFont: font.heading,
    letterSpacing: font.tracking,
    textTransform: font.transform,
    button: pick<ButtonStyle>(t.button, { fill: 1, outline: 1, soft: 1, shadow: 1 }, "outline"),
    corner: CORNERS[pick<Corner>(t.corner, CORNERS, "round")],
    avatarRadius: AVATARS[pick<AvatarShape>(t.avatar, AVATARS, "circle")],
    align: t.align === "left" ? "left" : "center",
  };
}

/** The button rules, which is where a preset is most visible. */
export function buttonCss(t: ResolvedTheme): string {
  const shared = `display:block;padding:15px 18px;border-radius:${t.corner};text-align:${t.align};
  color:inherit;text-decoration:none;font-weight:500;font-size:.9375rem;
  transition:transform .12s ease,box-shadow .12s ease,background-color .12s ease,border-color .12s ease`;

  switch (t.button) {
    case "fill":
      return `a.link{${shared};background:${t.accent};color:${t.onAccent};border:1px solid ${t.accent}}
a.link:hover{filter:brightness(.94)}`;
    case "soft":
      return `a.link{${shared};background:color-mix(in oklab,${t.foreground} 8%,transparent);
  border:1px solid transparent}
a.link:hover{background:color-mix(in oklab,${t.foreground} 14%,transparent)}`;
    case "shadow":
      // No blur and no easing on the shadow itself: the offset snapping to zero
      // on press is the whole effect.
      return `a.link{${shared};background:${t.background};
  border:2px solid ${t.foreground};box-shadow:4px 4px 0 0 ${t.foreground}}
a.link:hover{box-shadow:2px 2px 0 0 ${t.foreground};transform:translate(2px,2px)}
a.link:active{box-shadow:0 0 0 0 ${t.foreground};transform:translate(4px,4px)}`;
    default:
      return `a.link{${shared};border:1px solid color-mix(in oklab,${t.foreground} 22%,transparent)}
a.link:hover{border-color:${t.accent}}`;
  }
}
