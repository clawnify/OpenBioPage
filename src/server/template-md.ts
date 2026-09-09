// A template as a markdown document.
//
// This is the format a person downloads, hands to an AI ("make this colder",
// "this is for a law firm"), and uploads back. It has two readers and they
// want different things:
//
//   - The **frontmatter** is read by the renderer. Flat `key: value` pairs,
//     because the theme has no nested fields and a YAML parser would be a
//     dependency carried for nothing.
//   - The **body** is read by whoever edits the file next, human or model. It
//     carries the judgment the fields cannot state: which rules are load-
//     bearing, what the look is for, what breaks it.
//
// Both survive the round trip. An editor that rewrites the prose and leaves
// the fields alone still produces a valid template, and vice versa.

import { PRESETS, type Template, type Theme } from "./theme.js";

/** Fields the frontmatter may set, and how to read each one back. */
const FIELDS = {
  background: "string",
  background2: "string",
  angle: "number",
  foreground: "string",
  accent: "string",
  font: "string",
  button: "string",
  corner: "string",
  avatar: "string",
  align: "string",
} as const;

export interface ParsedTemplate {
  slug: string;
  name: string;
  tagline: string;
  notes: string;
  theme: Theme;
}

/** A slug we are willing to store and to match against a preset name. */
export function safeSlug(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** Render a template as the markdown a person downloads. */
export function toTemplateMd(slug: string, t: Template): string {
  const lines: string[] = ["---", `slug: ${slug}`, `name: ${t.name}`, `tagline: ${t.tagline}`];

  for (const key of Object.keys(FIELDS) as (keyof typeof FIELDS)[]) {
    const value = t.theme[key];
    if (value === undefined || value === null) continue;
    // Quote colours: a bare #hex starts a YAML comment, and someone will
    // eventually open this in an editor that cares.
    lines.push(`${key}: ${typeof value === "string" && value.startsWith("#") ? `"${value}"` : value}`);
  }

  // The tagline is not echoed into the body. It is already in the frontmatter,
  // and a body copy would be re-absorbed into `notes` on the next round trip,
  // growing the document by one line every time an editor touched it.
  lines.push("---", "", `# ${t.name}`, "", t.notes.trim(), "");
  return lines.join("\n");
}

/**
 * Read a template back. Unknown keys are ignored rather than rejected: a model
 * asked to edit this file will add a line it invented, and losing that line is
 * a better outcome than refusing the whole document.
 */
export function parseTemplateMd(md: string): ParsedTemplate | { error: string } {
  const match = /^\s*---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(md);
  if (!match) return { error: "No frontmatter block: the file must start with a --- fenced header" };

  const [, head, body] = match;
  const fields: Record<string, string> = {};

  for (const line of head.split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line.trim());
    if (!kv) continue;
    // Strip one layer of matching quotes.
    fields[kv[1]] = kv[2].trim().replace(/^(["'])([\s\S]*)\1$/, "$2");
  }

  const slug = safeSlug(fields.slug || fields.name || "");
  if (!slug) return { error: "The frontmatter needs a slug or a name" };
  if (slug in PRESETS) return { error: `"${slug}" is a built-in template; choose another slug` };

  const theme: Theme = {};
  for (const [key, kind] of Object.entries(FIELDS)) {
    const raw = fields[key];
    if (raw === undefined || raw === "") continue;
    if (kind === "number") {
      const n = Number(raw);
      if (Number.isFinite(n)) (theme as Record<string, unknown>)[key] = n;
    } else {
      (theme as Record<string, unknown>)[key] = raw;
    }
  }

  return {
    slug,
    name: (fields.name || slug).slice(0, 60),
    tagline: (fields.tagline || "").slice(0, 200),
    // Drop the leading `# Title`: it is generated on the way out from `name`,
    // so keeping it here would double it on the next round trip.
    notes: body.replace(/^\s*#\s+.*\r?\n+/, "").replace(/^\s*/, "").slice(0, 8000),
    theme,
  };
}
