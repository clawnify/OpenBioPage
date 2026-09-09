// Templates: the looks this install can put on a page.
//
// The list is the eight built-ins plus whatever the org wrote. Both kinds are
// downloadable as markdown and both are named the same way from a page's
// theme, so nothing downstream needs to know which is which.

import { createRoute, orgId, z } from "@clawnify/app";
import { get, query, run } from "../db.js";
import { fail, now, ok, type App } from "../env.js";
import { renderPage } from "../render.js";
import { parseTemplateMd, safeSlug, toTemplateMd } from "../template-md.js";
import { PRESETS, type Template } from "../theme.js";

const TemplateSchema = z
  .object({
    slug: z.string(),
    name: z.string(),
    tagline: z.string(),
    builtin: z.boolean(),
    theme: z.string(),
  })
  .openapi("Template");

/** A stored row, back in the shape the renderer and the serialiser want. */
function rowToTemplate(row: Record<string, unknown>): Template {
  let theme = {};
  try {
    theme = JSON.parse(String(row.theme));
  } catch {
    // A row we cannot parse still lists and still downloads; it just carries
    // no fields, which is visible rather than silent.
  }
  return { name: String(row.name), tagline: String(row.tagline), notes: "", theme };
}

export function registerTemplates(app: App) {
  const list = createRoute({
    method: "get",
    path: "/api/templates",
    tags: ["Templates"],
    summary: "Every template this install can apply to a page",
    responses: { 200: ok("The templates", z.object({ items: z.array(TemplateSchema) })), 403: fail("No organisation") },
  });

  app.openapi(list, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);

    const builtins = Object.entries(PRESETS).map(([slug, t]) => ({
      slug,
      name: t.name,
      tagline: t.tagline,
      builtin: true,
      theme: JSON.stringify(t.theme),
    }));

    const rows = await query<{ slug: string; name: string; tagline: string; theme: string }>(
      `SELECT slug, name, tagline, theme FROM templates WHERE org_id = ? ORDER BY name`,
      [org],
    );
    const custom = rows.map((r) => ({
      slug: String(r.slug),
      name: String(r.name),
      tagline: String(r.tagline),
      builtin: false,
      theme: String(r.theme),
    }));

    return c.json({ items: [...builtins, ...custom] } as never);
  });

  const download = createRoute({
    method: "get",
    path: "/api/templates/{slug}/markdown",
    tags: ["Templates"],
    summary: "The template as markdown, to edit and upload back",
    request: { params: z.object({ slug: z.string() }) },
    responses: { 200: { description: "The markdown" }, 403: fail("No organisation"), 404: fail("No such template") },
  });

  app.openapi(download, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);
    const slug = safeSlug(c.req.valid("param").slug);

    const headers = (name: string) => ({
      "content-type": "text/markdown; charset=utf-8",
      // The path has no extension, so the filename comes from here.
      "content-disposition": `attachment; filename="${name}.md"`,
    });

    const builtin = PRESETS[slug];
    if (builtin) return c.text(toTemplateMd(slug, builtin), 200, headers(slug));

    const row = await get(`SELECT body_md FROM templates WHERE org_id = ? AND slug = ?`, [org, slug]);
    if (!row) return c.json({ error: "No such template" }, 404);
    // The stored document, not a regenerated one: an editor's prose is the
    // point of the round trip.
    return c.text(String(row.body_md), 200, headers(slug));
  });

  // The gallery previews through the real renderer rather than a second copy of
  // the button and gradient rules in the admin bundle. One source of truth, and
  // a preview that is wrong is a renderer bug rather than a drifted mock.
  const preview = createRoute({
    method: "get",
    path: "/api/templates/{slug}/preview",
    tags: ["Templates"],
    summary: "A sample page rendered in this template",
    request: { params: z.object({ slug: z.string() }) },
    responses: { 200: { description: "The sample page" }, 403: fail("No organisation") },
  });

  app.openapi(preview, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);
    const slug = safeSlug(c.req.valid("param").slug);

    let custom: Record<string, unknown> | null = null;
    if (!(slug in PRESETS)) {
      const row = await get(`SELECT theme FROM templates WHERE org_id = ? AND slug = ?`, [org, slug]);
      if (row) {
        try {
          custom = JSON.parse(String(row.theme));
        } catch {
          custom = null;
        }
      }
    }

    const page = {
      id: "preview",
      slug: "preview",
      title: "Your client",
      subtitle: "One line about them",
      hostname: null,
      avatar_key: null,
      theme: JSON.stringify({ preset: slug }),
      footer_name: "Your studio",
      footer_url: "",
    };
    const blocks = [
      { id: "p1", kind: "header", label: "Start here", url: "", meta: "{}" },
      { id: "p2", kind: "link", label: "Latest work", url: "https://example.com", meta: '{"note":"Updated this week"}' },
      { id: "p3", kind: "link", label: "Book a call", url: "https://example.com", meta: "{}" },
      { id: "p4", kind: "email", label: "Get the monthly note", url: "", meta: "{}" },
    ];

    return c.html(renderPage(page, blocks, new URL(c.req.url).origin, custom), 200, {
      // A preview is derived from a row the caller can already read, and it is
      // never the page a visitor sees.
      "Cache-Control": "private, max-age=60",
    });
  });

  const upsert = createRoute({
    method: "post",
    path: "/api/templates",
    tags: ["Templates"],
    summary: "Add or replace a template from a markdown document",
    request: {
      body: { content: { "application/json": { schema: z.object({ markdown: z.string().min(1).max(20000) }) } } },
    },
    responses: {
      200: ok("The template", TemplateSchema),
      400: fail("The markdown could not be read"),
      403: fail("No organisation"),
    },
  });

  app.openapi(upsert, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);

    const parsed = parseTemplateMd(c.req.valid("json").markdown);
    if ("error" in parsed) return c.json({ error: parsed.error }, 400);

    const ts = now();
    await run(
      `INSERT INTO templates (slug, org_id, name, tagline, theme, body_md, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (org_id, slug) DO UPDATE SET
         name = excluded.name, tagline = excluded.tagline,
         theme = excluded.theme, body_md = excluded.body_md, updated_at = excluded.updated_at`,
      [parsed.slug, org, parsed.name, parsed.tagline, JSON.stringify(parsed.theme), c.req.valid("json").markdown, ts, ts],
    );

    return c.json({
      slug: parsed.slug,
      name: parsed.name,
      tagline: parsed.tagline,
      builtin: false,
      theme: JSON.stringify(parsed.theme),
    } as never);
  });

  const remove = createRoute({
    method: "delete",
    path: "/api/templates/{slug}",
    tags: ["Templates"],
    summary: "Delete a custom template",
    request: { params: z.object({ slug: z.string() }) },
    responses: {
      200: ok("Deleted", z.object({ deleted: z.boolean() })),
      400: fail("A built-in template cannot be deleted"),
      403: fail("No organisation"),
    },
  });

  app.openapi(remove, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);
    const slug = safeSlug(c.req.valid("param").slug);
    if (slug in PRESETS) return c.json({ error: "A built-in template cannot be deleted" }, 400);

    // Pages naming this template keep rendering: an unknown preset falls back
    // to the defaults rather than to a blank page.
    await run(`DELETE FROM templates WHERE org_id = ? AND slug = ?`, [org, slug]);
    return c.json({ deleted: true } as never);
  });
}

export { rowToTemplate };
