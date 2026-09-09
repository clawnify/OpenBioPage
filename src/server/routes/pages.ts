// Pages: one per client. Everything an agency does day to day starts here.

import { createRoute, orgId, z } from "@clawnify/app";
import { get, query, run } from "../db.js";
import { fail, now, ok, paginate, slugify, uid, PaginationQuery, type App } from "../env.js";
import { customThemeFor } from "../page-theme.js";
import { renderPage, type RenderBlock, type RenderPage } from "../render.js";

const PageSchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    title: z.string(),
    subtitle: z.string(),
    hostname: z.string().nullable(),
    avatar_key: z.string().nullable(),
    theme: z.string(),
    footer_name: z.string(),
    footer_url: z.string(),
    published: z.number().int(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .openapi("Page");

export function registerPages(app: App) {
  const list = createRoute({
    method: "get",
    path: "/api/pages",
    tags: ["Pages"],
    summary: "List link pages, newest first",
    request: { query: PaginationQuery },
    responses: {
      200: ok("A page of link pages", z.object({ items: z.array(PageSchema), total: z.number().int(), page: z.number().int() })),
      403: fail("No organisation on the request"),
    },
  });

  app.openapi(list, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);

    const { limit, offset, page } = paginate(c.req.valid("query"));
    const search = (c.req.valid("query").search ?? "").trim();
    const like = `%${search}%`;

    const where = search ? "org_id = ? AND (title LIKE ? OR slug LIKE ?)" : "org_id = ?";
    const args = search ? [org, like, like] : [org];

    const items = await query(
      `SELECT * FROM pages WHERE ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
      [...args, limit, offset],
    );
    const counted = await get<{ n: number }>(`SELECT COUNT(*) AS n FROM pages WHERE ${where}`, args);

    return c.json({ items, total: counted?.n ?? 0, page } as never);
  });

  const create = createRoute({
    method: "post",
    path: "/api/pages",
    tags: ["Pages"],
    summary: "Create a link page for a client",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              title: z.string().min(1).max(120),
              slug: z.string().max(60).optional().openapi({ description: "Path segment. Derived from the title when omitted." }),
              subtitle: z.string().max(200).optional(),
              hostname: z.string().max(253).optional().openapi({
                description: "Custom hostname, once its certificate is live. One page per hostname.",
              }),
            }),
          },
        },
      },
    },
    responses: { 200: ok("The new page", PageSchema), 403: fail("No organisation"), 409: fail("Slug or hostname already taken") },
  });

  app.openapi(create, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);

    const body = c.req.valid("json");
    const slug = slugify(body.slug || body.title);
    const ts = now();
    const id = uid();

    // The install's own footer default, so a new client page is signed without
    // anyone remembering to sign it.
    const defaults = await get<{ footer_name: string; footer_url: string }>(
      `SELECT footer_name, footer_url FROM settings WHERE org_id = ?`,
      [org],
    );

    try {
      await run(
        `INSERT INTO pages (id, org_id, slug, title, subtitle, hostname, theme, footer_name, footer_url, published, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, '{}', ?, ?, 0, ?, ?)`,
        [
          id, org, slug, body.title, body.subtitle ?? "", body.hostname ?? null,
          defaults?.footer_name ?? "", defaults?.footer_url ?? "", ts, ts,
        ],
      );
    } catch {
      return c.json({ error: "That slug or hostname is already in use" }, 409);
    }

    const created = await get(`SELECT * FROM pages WHERE id = ?`, [id]);
    return c.json(created as never);
  });

  const read = createRoute({
    method: "get",
    path: "/api/pages/{id}",
    tags: ["Pages"],
    summary: "One page, with its brand and publication state",
    request: { params: z.object({ id: z.string() }) },
    responses: { 200: ok("The page", PageSchema), 403: fail("No organisation"), 404: fail("No such page") },
  });

  app.openapi(read, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);
    const row = await get(`SELECT * FROM pages WHERE id = ? AND org_id = ?`, [c.req.valid("param").id, org]);
    if (!row) return c.json({ error: "No such page" }, 404);
    return c.json(row as never);
  });

  // The page as it will look, published or not. The public route deliberately
  // refuses a draft, so without this you cannot see what you are editing until
  // you have already shipped it.
  const preview = createRoute({
    method: "get",
    path: "/api/pages/{id}/preview",
    tags: ["Pages"],
    summary: "The page rendered for editing, including while it is a draft",
    request: { params: z.object({ id: z.string() }) },
    responses: { 200: { description: "The page" }, 403: fail("No organisation"), 404: fail("No such page") },
  });

  app.openapi(preview, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);
    const { id } = c.req.valid("param");

    const page = await get<RenderPage & { org_id: string }>(
      `SELECT id, org_id, slug, title, subtitle, hostname, avatar_key, theme, footer_name, footer_url
         FROM pages WHERE id = ? AND org_id = ?`,
      [id, org],
    );
    if (!page) return c.json({ error: "No such page" }, 404);

    // Inactive blocks stay out, so the preview matches the page rather than the
    // editor: a hidden row is hidden here too.
    const blocks = await query<RenderBlock>(
      `SELECT id, kind, label, url, meta FROM blocks
        WHERE page_id = ? AND active = 1 ORDER BY position ASC, created_at ASC`,
      [id],
    );

    const custom = await customThemeFor(page.org_id, page.theme);
    return c.html(renderPage(page, blocks, new URL(c.req.url).origin, custom), 200, {
      "Cache-Control": "no-store",
    });
  });

  const update = createRoute({
    method: "patch",
    path: "/api/pages/{id}",
    tags: ["Pages"],
    summary: "Edit a page's identity, brand or publication state",
    request: {
      params: z.object({ id: z.string() }),
      body: {
        content: {
          "application/json": {
            schema: z.object({
              title: z.string().min(1).max(120).optional(),
              subtitle: z.string().max(200).optional(),
              hostname: z.string().max(253).nullable().optional(),
              theme: z.string().max(2000).optional().openapi({
                description: 'JSON: { accent, background, foreground, corner, align }. The client brand, as CSS custom properties.',
              }),
              footer_name: z.string().max(120).optional(),
              footer_url: z.string().max(300).optional(),
              published: z.number().int().min(0).max(1).optional(),
            }),
          },
        },
      },
    },
    responses: { 200: ok("The page", PageSchema), 403: fail("No organisation"), 404: fail("No such page") },
  });

  app.openapi(update, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);

    const { id } = c.req.valid("param");
    const body = c.req.valid("json");

    const existing = await get<{ id: string }>(`SELECT id FROM pages WHERE id = ? AND org_id = ?`, [id, org]);
    if (!existing) return c.json({ error: "No such page" }, 404);

    // Explicit allowlist rather than trusting the parsed body's key set: these
    // names are interpolated into the SET clause, so the guard belongs here and
    // not one refactor away in the schema.
    const EDITABLE = ["title", "subtitle", "hostname", "theme", "footer_name", "footer_url", "published"] as const;
    const fields = Object.entries(body).filter(
      ([k, v]) => v !== undefined && (EDITABLE as readonly string[]).includes(k),
    );
    if (fields.length) {
      await run(
        `UPDATE pages SET ${fields.map(([k]) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ? AND org_id = ?`,
        [...fields.map(([, v]) => v as string | number | null), now(), id, org],
      );
    }

    const updated = await get(`SELECT * FROM pages WHERE id = ?`, [id]);
    return c.json(updated as never);
  });

  const remove = createRoute({
    method: "delete",
    path: "/api/pages/{id}",
    tags: ["Pages"],
    summary: "Delete a page and its blocks",
    request: { params: z.object({ id: z.string() }) },
    responses: { 200: ok("Deleted", z.object({ ok: z.boolean() })), 403: fail("No organisation"), 404: fail("No such page") },
  });

  app.openapi(remove, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);

    const { id } = c.req.valid("param");
    const existing = await get<{ id: string }>(`SELECT id FROM pages WHERE id = ? AND org_id = ?`, [id, org]);
    if (!existing) return c.json({ error: "No such page" }, 404);

    // The clicks outlive the page on purpose: a client leaving should not erase
    // the record of what their page did while it ran.
    await run(`DELETE FROM blocks WHERE page_id = ? AND org_id = ?`, [id, org]);
    await run(`DELETE FROM pages WHERE id = ? AND org_id = ?`, [id, org]);
    return c.json({ ok: true } as never);
  });
}
