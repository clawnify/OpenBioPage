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
  /** `hero` puts the image full-bleed behind the header; `classic` is a round avatar. */
  header?: "classic" | "hero";
  /** R2 key of the background image, served from /m/. */
  image?: string;
  /** Scrim opacity over the image. Raised to the legible floor, never lowered. */
  overlay?: number;
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
  header: "classic" | "hero";
  image: string | null;
  overlay: number;
  scrim: string;
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

/** Relative luminance of a hex colour, or null if it is not measurable. */
function luminance(hex: string): number | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const full = m[1].length === 3 ? m[1].split("").map((ch) => ch + ch).join("") : m[1];
  const channel = (i: number) => {
    const v = parseInt(full.slice(i * 2, i * 2 + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

/** The 0-255 grey with this relative luminance. */
function greyFor(target: number): number {
  const clamped = Math.max(0, Math.min(1, target));
  return 255 * (clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055);
}

/**
 * The scrim opacity below which text stops being guaranteed legible on an
 * image, computed from the text colour rather than pinned to a constant.
 *
 * A photograph cannot be contrast-checked: the next upload may be a white sky
 * where the last was a dark wall. So the guarantee has to come from the layer
 * we control. This solves for the alpha at which the *worst possible pixel* —
 * pure white under light text, pure black under dark — still clears 4.5:1.
 *
 * It is a function and not the two constants it replaces because those were
 * solved for pure white and pure black, and the first preset to use a near-white
 * foreground (`ink`, at #f4f3f1) came out at 4.04:1 and passed the check anyway.
 * An author may go darker than this. Lighter is refused, because the page would
 * look right on the photo they tested and fail on the one they upload next.
 */
export function scrimFloor(foreground: string): number {
  const lum = luminance(foreground);
  // An unmeasurable colour gets the most cautious answer rather than a guess.
  if (lum === null) return 0.6;

  // Solved against 4.6 rather than 4.5: the composited channel is rounded to a
  // whole byte before it is painted, and an exact solve lands a thousandth
  // under the line as often as over it.
  const TARGET = 4.6;

  if (lum > 0.35) {
    // Light text, black scrim: hold the background *below* a ceiling.
    const ceiling = (lum + 0.05) / TARGET - 0.05;
    return Math.min(0.92, Math.max(0, 1 - greyFor(ceiling) / 255));
  }
  // Dark text, white scrim: hold the background *above* a floor.
  const needed = TARGET * (lum + 0.05) - 0.05;
  return Math.min(0.92, Math.max(0, greyFor(needed) / 255));
}

const CORNERS: Record<Corner, string> = { sharp: "0px", round: "12px", pill: "999px" };
const AVATARS: Record<AvatarShape, string> = { circle: "50%", rounded: "22%", square: "0" };

/**
 * A template is a look plus the prose that explains it.
 *
 * The prose is not decoration. A template is downloadable as markdown and
 * handed to an AI to edit ("make this one colder", "this is for a law firm"),
 * and the fields alone do not say which parts are load-bearing. `notes` is
 * where the judgment lives — the rule that a filled button ruins `paper`
 * survives a round trip through an editor; `button: outline` does not explain
 * itself.
 */
export interface Template {
  name: string;
  tagline: string;
  notes: string;
  theme: Theme;
}

/**
 * The built-in templates. Each one is a position, not a palette: someone who
 * wants the page to disappear picks `mono`, someone selling to teenagers picks
 * `candy`. Adding one is adding a row here and nothing else.
 */
export const PRESETS: Record<string, Template> = {
  mono: {
    name: "Mono",
    tagline: "White, hairline outlines, monospace. The page gets out of the way.",
    notes: `For people whose own work is the thing worth looking at: designers,
photographers, developers. Nothing here is decorative, and that is the point.

Rules that matter:
- The buttons stay outlines. Filling them puts the page ahead of the work.
- Corners stay square. A rounded corner here reads as a consumer app.
- If a brand colour has to go in, put it on \`accent\` only, and let the
  buttons keep their hairline border.`,
    theme: { background: "#ffffff", foreground: "#111111", accent: "#111111", font: "mono", button: "outline", corner: "sharp", avatar: "square" },
  },
  ink: {
    name: "Ink",
    tagline: "Near-black ground, soft filled buttons. Reads expensive.",
    notes: `Studios, photographers, anyone whose work is images. A dark ground
makes thumbnails and embeds sit better than a white one does.

Rules that matter:
- The buttons are soft fills, not outlines: a hairline on near-black
  disappears at phone brightness.
- Keep \`accent\` near-white unless the brand demands otherwise. A saturated
  accent on this ground vibrates.`,
    theme: { background: "#0e0e0f", foreground: "#f4f3f1", accent: "#f4f3f1", font: "sans", button: "soft", corner: "round", avatar: "circle" },
  },
  paper: {
    name: "Paper",
    tagline: "Warm stock and a serif. Printed, not published.",
    notes: `Bookshops, writers, restaurants, anyone who would rather look like
a printed thing than a website.

Rules that matter:
- The buttons never fill. A filled button on this ground reads as a web form
  dropped into a book.
- The serif carries both display and body on purpose. Pairing it with a sans
  body is the single fastest way to lose the feel.`,
    theme: { background: "#f6f1e7", foreground: "#2b2622", accent: "#7a5c3e", font: "serif", button: "outline", corner: "round", avatar: "circle" },
  },
  sunset: {
    name: "Sunset",
    tagline: "A gradient and white pills. The look most creators want.",
    notes: `Musicians, creators, anyone whose audience arrives from a social
profile and expects colour.

Rules that matter:
- The stops are darker than a sunset "should" be, and that is deliberate: the
  first version measured 2.32:1 for white body text. Both stops now clear
  4.5:1. If you lighten them, re-check the contrast or the page becomes
  unreadable for the people who need it most.
- The buttons are white fills. On a gradient, an outline button loses its
  edge halfway down the page.`,
    theme: { background: "#a83a2f", background2: "#8c1d4e", angle: 160, foreground: "#ffffff", accent: "#ffffff", font: "rounded", button: "fill", corner: "pill", avatar: "circle" },
  },
  brutal: {
    name: "Brutal",
    tagline: "Hard offset shadows, condensed caps, no blur. Loud on purpose.",
    notes: `Clubs, gigs, streetwear, sunday-league teams. It is shouting, and
it should be used where shouting is correct.

Rules that matter:
- The shadow has no blur and no easing. The offset snapping to zero on press
  is the entire effect; softening it leaves a bad drop shadow.
- The heading typeface is condensed and uppercase. Sentence case here reads
  as a mistake rather than a choice.`,
    theme: { background: "#fdf35e", foreground: "#101010", accent: "#101010", font: "condensed", button: "shadow", corner: "sharp", avatar: "square" },
  },
  slate: {
    name: "Slate",
    tagline: "Cool, quiet, blue accent. Looks like it has a compliance team.",
    notes: `Consultants, B2B, agencies selling to enterprises. The job is to
look unsurprising.

Rules that matter:
- The accent is the only colour. Adding a second one turns a considered page
  into a template.
- Soft fills, not outlines: on a light grey ground a hairline border reads as
  a disabled control.`,
    theme: { background: "#eef1f4", foreground: "#1d2430", accent: "#2f5bd8", font: "sans", button: "soft", corner: "round", avatar: "rounded" },
  },
  candy: {
    name: "Candy",
    tagline: "Pastel gradient, full pills, rounded type. Unashamedly sweet.",
    notes: `Streamers, creators with a young audience, anything where "pretty"
is the point rather than a compromise.

Rules that matter:
- The pills go all the way round. A 12px corner here looks like a bug.
- Button text is computed dark, not white: white on this pink measures 2.6:1
  and the app will refuse to do it.`,
    theme: { background: "#fff0f6", background2: "#e7f0ff", angle: 200, foreground: "#3a2b3f", accent: "#e0559a", font: "rounded", button: "fill", corner: "pill", avatar: "circle" },
  },
  forest: {
    name: "Forest",
    tagline: "Deep green, gold accent, serif. Hospitality.",
    notes: `Hotels, restaurants, wineries — places that print a menu.

Rules that matter:
- Gold is the accent, never the ground. A gold background loses the contrast
  the whole look depends on.
- Outline buttons keep it quiet. Filling them in gold turns a dining room
  into a casino.`,
    theme: { background: "#12241c", foreground: "#eef3ee", accent: "#c9a961", font: "serif", button: "outline", corner: "round", avatar: "circle" },
  },
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
export function resolveTheme(raw: string, custom?: Theme | null): ResolvedTheme {
  let theme: Theme = {};
  try {
    const parsed = JSON.parse(raw) as Theme;
    if (parsed && typeof parsed === "object") theme = parsed;
  } catch {
    // A malformed theme costs the look, never the page.
  }

  // A named preset resolves to a built-in first, then to the custom template
  // the caller loaded for this page. An unknown name resolves to nothing,
  // which leaves the defaults rather than an unstyled page.
  const base: Theme = (theme.preset && PRESETS[theme.preset]?.theme) || custom || {};
  const t: Theme = { ...base, ...theme };

  const font = FONTS[pick<FontKey>(t.font, FONTS, "sans")];
  const accent = safeColor(t.accent) ?? "#1b1a19";
  const background2 = safeColor(t.background2);

  // A light foreground wants a dark scrim, and the reverse. Which one decides
  // both the colour and the floor.
  const foreground = safeColor(t.foreground) ?? "#1b1a19";
  const lightText = readableOn(foreground) === "#111111";
  const floor = scrimFloor(foreground);
  const image = typeof t.image === "string" && /^[\w./-]{1,200}$/.test(t.image) ? t.image : null;

  return {
    header: t.header === "hero" && image ? "hero" : "classic",
    image,
    overlay: Math.min(0.92, Math.max(floor, Number.isFinite(t.overlay) ? Number(t.overlay) : floor)),
    scrim: lightText ? "0,0,0" : "255,255,255",
    background: safeColor(t.background) ?? "#ffffff",
    background2,
    angle: Number.isFinite(t.angle) ? Math.max(0, Math.min(360, Number(t.angle))) : 160,
    foreground,
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
  // Every row is the same box. A note or a thumbnail changes what is inside it,
  // never how tall it is: a list of buttons at three different heights reads as
  // a rendering fault rather than as emphasis, and nobody meant the row with a
  // note to be the important one.
  const shared = `display:flex;align-items:center;box-sizing:border-box;
  justify-content:${t.align === "left" ? "flex-start" : "center"};
  min-height:72px;padding:10px 18px;border-radius:${t.corner};text-align:${t.align};
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
