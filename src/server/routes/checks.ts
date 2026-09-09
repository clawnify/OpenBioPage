// The link checker.
//
// A link page rots quietly: a Discord invite expires, a shop link 404s, a
// service shuts down, and nobody notices because nobody opens their own page.
// This walks one page's links and records what each one answered, which is what
// turns the overview's `broken` column from a hopeful number into a real one.

import { createRoute, orgId, z } from "@clawnify/app";
import { get, query, run } from "../db.js";
import { fail, now, ok, type App } from "../env.js";
import { safeUrl } from "../render.js";

/** Bounded so one call cannot run past the request budget on a long page. */
const MAX_CHECKS = 40;
const TIMEOUT_MS = 8000;

export function registerChecks(app: App) {
  const check = createRoute({
    method: "post",
    path: "/api/pages/{pageId}/check",
    tags: ["Reports"],
    summary: "Fetch every link on a page and record what it answered",
    request: { params: z.object({ pageId: z.string() }) },
    responses: {
      200: ok(
        "One row per link checked",
        z.object({
          checked: z.number().int(),
          broken: z.array(z.object({ id: z.string(), label: z.string(), url: z.string(), status: z.number().int() })),
        }),
      ),
      403: fail("No organisation"),
      404: fail("No such page"),
    },
  });

  app.openapi(check, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);
    const { pageId } = c.req.valid("param");

    const owned = await get<{ id: string }>(`SELECT id FROM pages WHERE id = ? AND org_id = ?`, [pageId, org]);
    if (!owned) return c.json({ error: "No such page" }, 404);

    const links = await query<{ id: string; label: string; url: string }>(
      `SELECT id, label, url FROM blocks
        WHERE page_id = ? AND active = 1 AND kind IN ('link', 'embed') AND url <> ''
        ORDER BY position ASC LIMIT ?`,
      [pageId, MAX_CHECKS],
    );

    const broken: { id: string; label: string; url: string; status: number }[] = [];
    const ts = now();

    for (const link of links) {
      const target = safeUrl(link.url);
      // A URL we would refuse to render is already broken as far as a visitor
      // is concerned, so it is reported rather than skipped.
      let status = target ? 0 : 400;

      if (target) {
        try {
          // HEAD first: most hosts answer it and it costs nothing. Some refuse
          // it with a 405, so fall back to a GET before calling a link dead.
          const head = await fetch(target, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS) });
          status = head.status === 405 || head.status === 501
            ? (await fetch(target, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS) })).status
            : head.status;
        } catch {
          // Timeout, DNS failure, TLS failure. 599 is ours: "did not answer".
          status = 599;
        }
      }

      await run(`UPDATE blocks SET checked_at = ?, check_status = ? WHERE id = ? AND org_id = ?`, [ts, status, link.id, org]);
      if (status >= 400) broken.push({ id: link.id, label: link.label, url: link.url, status });
    }

    return c.json({ checked: links.length, broken } as never);
  });
}
