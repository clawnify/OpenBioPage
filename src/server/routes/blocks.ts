// Blocks: the rows on a page. Adding, editing, reordering and retiring them is
// the whole editing surface, and it is the one an agent drives most often.

import { createRoute, orgId, z } from "@clawnify/app";
import { get, query, run } from "../db.js";
import { fail, now, ok, uid, type App } from "../env.js";
import { mirrorImage, readLinkMeta } from "../link-meta.js";

const KINDS = ["link", "header", "embed", "email"] as const;

const BlockSchema = z
  .object({
    id: z.string(),
    page_id: z.string(),
    kind: z.enum(KINDS),
    label: z.string(),
    url: z.string(),
    meta: z.string(),
    position: z.number().int(),
    active: z.number().int(),
    checked_at: z.string().nullable(),
    check_status: z.number().int().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .openapi("Block");

/** A page an agent named must belong to the caller's org before anything else. */
async function ownedPage(org: string, pageId: string) {
  return get<{ id: string }>(`SELECT id FROM pages WHERE id = ? AND org_id = ?`, [pageId, org]);
}

export function registerBlocks(app: App) {
  const list = createRoute({
    method: "get",
    path: "/api/pages/{pageId}/blocks",
    tags: ["Blocks"],
    summary: "Every block on one page, in display order",
    request: { params: z.object({ pageId: z.string() }) },
    responses: {
      200: ok("The blocks", z.object({ items: z.array(BlockSchema) })),
      403: fail("No organisation"),
      404: fail("No such page"),
    },
  });

  // Bounded by the page, which is what keeps it off the unbounded-list rule: a
  // link page with hundreds of rows is already broken as a link page.
  app.openapi(list, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);
    const { pageId } = c.req.valid("param");
    if (!(await ownedPage(org, pageId))) return c.json({ error: "No such page" }, 404);

    const items = await query(
      `SELECT * FROM blocks WHERE page_id = ? ORDER BY position ASC, created_at ASC LIMIT 200`,
      [pageId],
    );
    return c.json({ items } as never);
  });

  const create = createRoute({
    method: "post",
    path: "/api/pages/{pageId}/blocks",
    tags: ["Blocks"],
    summary: "Add a block to a page",
    request: {
      params: z.object({ pageId: z.string() }),
      body: {
        content: {
          "application/json": {
            schema: z.object({
              kind: z.enum(KINDS).default("link"),
              label: z.string().min(1).max(120),
              url: z.string().max(2000).optional().openapi({ description: "http or https only. Required for link and embed." }),
              meta: z.string().max(1000).optional().openapi({ description: 'JSON: { note }. A muted second line under the label.' }),
              position: z.number().int().optional().openapi({ description: "Defaults to the end of the page." }),
            }),
          },
        },
      },
    },
    responses: { 200: ok("The new block", BlockSchema), 400: fail("A link needs a URL"), 403: fail("No organisation"), 404: fail("No such page") },
  });

  app.openapi(create, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);
    const { pageId } = c.req.valid("param");
    if (!(await ownedPage(org, pageId))) return c.json({ error: "No such page" }, 404);

    const body = c.req.valid("json");
    if ((body.kind === "link" || body.kind === "embed") && !body.url) {
      return c.json({ error: `A ${body.kind} block needs a url` }, 400);
    }

    const last = await get<{ n: number }>(`SELECT COALESCE(MAX(position), -1) AS n FROM blocks WHERE page_id = ?`, [pageId]);
    const id = uid();
    const ts = now();

    await run(
      `INSERT INTO blocks (id, org_id, page_id, kind, label, url, meta, position, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [id, org, pageId, body.kind, body.label, body.url ?? "", body.meta ?? "{}", body.position ?? (last?.n ?? -1) + 1, ts, ts],
    );
    await run(`UPDATE pages SET updated_at = ? WHERE id = ?`, [ts, pageId]);

    const created = await get(`SELECT * FROM blocks WHERE id = ?`, [id]);
    return c.json(created as never);
  });

  // What a URL says about itself, so the editor can fill the row in rather than
  // asking someone to retype a title that is already published on the page.
  const inspect = createRoute({
    method: "get",
    path: "/api/link-meta",
    tags: ["Blocks"],
    summary: "Read a URL's own title, description and image",
    request: { query: z.object({ url: z.string().max(2000) }) },
    responses: {
      200: ok(
        "What the page publishes about itself; blank fields when it publishes none",
        z.object({ title: z.string(), description: z.string(), image: z.string() }),
      ),
      403: fail("No organisation"),
    },
  });

  app.openapi(inspect, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);

    const meta = await readLinkMeta(c.req.valid("query").url);
    // The image is copied into this app's own bucket rather than hotlinked.
    // A remote <img> would be the first external request the public page has
    // ever made, which tells the destination who is looking at the page before
    // anyone clicks, and leaves the row dependent on someone else's uptime.
    const image = meta.image ? await mirrorImage(c.env.UPLOADS, org, meta.image) : "";
    return c.json({ ...meta, image } as never);
  });

  const update = createRoute({
    method: "patch",
    path: "/api/blocks/{id}",
    tags: ["Blocks"],
    summary: "Edit a block, or take it off the page without deleting it",
    request: {
      params: z.object({ id: z.string() }),
      body: {
        content: {
          "application/json": {
            schema: z.object({
              label: z.string().min(1).max(120).optional(),
              url: z.string().max(2000).optional(),
              meta: z.string().max(1000).optional(),
              position: z.number().int().optional(),
              active: z.number().int().min(0).max(1).optional().openapi({
                description: "0 hides the row and keeps its click history. Prefer it over deleting.",
              }),
            }),
          },
        },
      },
    },
    responses: { 200: ok("The block", BlockSchema), 403: fail("No organisation"), 404: fail("No such block") },
  });

  app.openapi(update, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);
    const { id } = c.req.valid("param");

    const existing = await get<{ id: string; page_id: string }>(
      `SELECT id, page_id FROM blocks WHERE id = ? AND org_id = ?`,
      [id, org],
    );
    if (!existing) return c.json({ error: "No such block" }, 404);

    const body = c.req.valid("json");
    const EDITABLE = ["label", "url", "meta", "position", "active"] as const;
    const fields = Object.entries(body).filter(
      ([k, v]) => v !== undefined && (EDITABLE as readonly string[]).includes(k),
    );

    if (fields.length) {
      const ts = now();
      await run(
        `UPDATE blocks SET ${fields.map(([k]) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ? AND org_id = ?`,
        [...fields.map(([, v]) => v as string | number), ts, id, org],
      );
      await run(`UPDATE pages SET updated_at = ? WHERE id = ?`, [ts, existing.page_id]);
    }

    const updated = await get(`SELECT * FROM blocks WHERE id = ?`, [id]);
    return c.json(updated as never);
  });

  const reorder = createRoute({
    method: "post",
    path: "/api/pages/{pageId}/blocks/order",
    tags: ["Blocks"],
    summary: "Set the display order of a page's blocks in one call",
    request: {
      params: z.object({ pageId: z.string() }),
      body: {
        content: {
          "application/json": {
            schema: z.object({
              ids: z.array(z.string()).min(1).max(200).openapi({ description: "Block ids, top to bottom." }),
            }),
          },
        },
      },
    },
    responses: { 200: ok("Reordered", z.object({ ok: z.boolean() })), 403: fail("No organisation"), 404: fail("No such page") },
  });

  // One statement per block rather than a single CASE expression: D1 caps a
  // statement at 100 bound parameters, and a page of 60 rows would blow past it.
  app.openapi(reorder, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);
    const { pageId } = c.req.valid("param");
    if (!(await ownedPage(org, pageId))) return c.json({ error: "No such page" }, 404);

    const { ids } = c.req.valid("json");
    for (let i = 0; i < ids.length; i++) {
      await run(`UPDATE blocks SET position = ? WHERE id = ? AND page_id = ? AND org_id = ?`, [i, ids[i], pageId, org]);
    }
    await run(`UPDATE pages SET updated_at = ? WHERE id = ?`, [now(), pageId]);
    return c.json({ ok: true } as never);
  });

  const remove = createRoute({
    method: "delete",
    path: "/api/blocks/{id}",
    tags: ["Blocks"],
    summary: "Delete a block outright",
    request: { params: z.object({ id: z.string() }) },
    responses: { 200: ok("Deleted", z.object({ ok: z.boolean() })), 403: fail("No organisation"), 404: fail("No such block") },
  });

  app.openapi(remove, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);
    const { id } = c.req.valid("param");
    const existing = await get<{ id: string }>(`SELECT id FROM blocks WHERE id = ? AND org_id = ?`, [id, org]);
    if (!existing) return c.json({ error: "No such block" }, 404);
    await run(`DELETE FROM blocks WHERE id = ? AND org_id = ?`, [id, org]);
    return c.json({ ok: true } as never);
  });
}
