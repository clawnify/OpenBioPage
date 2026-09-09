// What the vendor dashboards will not give you: every client page in one list,
// with the two facts that decide whether it needs attention.
//
// This is the screen an agency actually opens. Building a page is a one-time
// job; noticing that a client's page has been stale for eleven weeks, or that
// its top link is dead, is the recurring one, and it is what a per-client
// install can never show.

import { createRoute, orgId, z } from "@clawnify/app";
import { get, query } from "../db.js";
import { fail, ok, paginate, PaginationQuery, type App } from "../env.js";

const OverviewRow = z
  .object({
    id: z.string(),
    slug: z.string(),
    title: z.string(),
    hostname: z.string().nullable(),
    published: z.number().int(),
    updated_at: z.string(),
    blocks: z.number().int(),
    /** Blocks whose last check failed. The count that means "fix this today". */
    broken: z.number().int(),
    clicks_7d: z.number().int(),
    clicks_30d: z.number().int(),
  })
  .openapi("PageOverview");

const BlockStat = z
  .object({
    id: z.string(),
    label: z.string(),
    kind: z.string(),
    url: z.string(),
    position: z.number().int(),
    active: z.number().int(),
    check_status: z.number().int().nullable(),
    clicks_30d: z.number().int(),
  })
  .openapi("BlockStat");

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

export function registerStats(app: App) {
  const overview = createRoute({
    method: "get",
    path: "/api/overview",
    tags: ["Reports"],
    summary: "Every page with its freshness, its broken links and its recent clicks",
    request: { query: PaginationQuery },
    responses: {
      200: ok("A page of rows, stalest first", z.object({ items: z.array(OverviewRow), total: z.number().int(), page: z.number().int() })),
      403: fail("No organisation"),
    },
  });

  app.openapi(overview, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);

    const { limit, offset, page } = paginate(c.req.valid("query"));
    const items = await query(
      `SELECT p.id, p.slug, p.title, p.hostname, p.published, p.updated_at,
              (SELECT COUNT(*) FROM blocks b WHERE b.page_id = p.id AND b.active = 1) AS blocks,
              (SELECT COUNT(*) FROM blocks b WHERE b.page_id = p.id AND b.active = 1
                 AND b.check_status IS NOT NULL AND b.check_status >= 400) AS broken,
              (SELECT COUNT(*) FROM clicks k WHERE k.page_id = p.id AND k.ts >= ?) AS clicks_7d,
              (SELECT COUNT(*) FROM clicks k WHERE k.page_id = p.id AND k.ts >= ?) AS clicks_30d
         FROM pages p
        WHERE p.org_id = ?
        ORDER BY p.updated_at ASC
        LIMIT ? OFFSET ?`,
      [daysAgo(7), daysAgo(30), org, limit, offset],
    );
    const counted = await get<{ n: number }>(`SELECT COUNT(*) AS n FROM pages WHERE org_id = ?`, [org]);
    return c.json({ items, total: counted?.n ?? 0, page } as never);
  });

  const pageStats = createRoute({
    method: "get",
    path: "/api/pages/{pageId}/stats",
    tags: ["Reports"],
    summary: "Clicks per block on one page, so the order can follow the numbers",
    request: { params: z.object({ pageId: z.string() }) },
    responses: {
      200: ok("Blocks with their 30-day clicks, busiest first", z.object({ items: z.array(BlockStat), total_clicks_30d: z.number().int() })),
      403: fail("No organisation"),
      404: fail("No such page"),
    },
  });

  app.openapi(pageStats, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);
    const { pageId } = c.req.valid("param");

    const owned = await get<{ id: string }>(`SELECT id FROM pages WHERE id = ? AND org_id = ?`, [pageId, org]);
    if (!owned) return c.json({ error: "No such page" }, 404);

    const since = daysAgo(30);
    const items = await query<{ clicks_30d: number }>(
      `SELECT b.id, b.label, b.kind, b.url, b.position, b.active, b.check_status,
              (SELECT COUNT(*) FROM clicks k WHERE k.block_id = b.id AND k.ts >= ?) AS clicks_30d
         FROM blocks b
        WHERE b.page_id = ?
        ORDER BY clicks_30d DESC
        LIMIT 200`,
      [since, pageId],
    );

    const total = items.reduce((sum, row) => sum + (row.clicks_30d ?? 0), 0);
    return c.json({ items, total_clicks_30d: total } as never);
  });
}
