// The public half of the app: the page itself, the counting redirect, the
// avatar, and the one form an anonymous visitor may post.
//
// None of this is on the OpenAPI surface. These are plain Hono routes because
// the agent has no business calling them (it would be clicking its own client's
// links), and because every route the app publishes costs the agent context on
// every turn.
//
// Everything here is reachable without authentication, which is the point of a
// link page and also the reason this is the most carefully written file in the
// repository. `orgId(c)` is null on these requests, so every query below is
// scoped by an id the visitor could not have guessed a row out of: the page's
// own slug, or a block id that is a UUID. Read escapeHtml and safeUrl in
// render.ts before adding to it.

import { get, query, run } from "../db.js";
import { uid, now, type App } from "../env.js";
import { renderPage, safeUrl, type RenderBlock, type RenderPage } from "../render.js";

/** Cache the rendered page at the edge briefly: a link page is read far more
 *  often than it is edited, and an agency's change should still show up fast. */
const PAGE_CACHE = "public, max-age=60, stale-while-revalidate=600";

export function registerPublic(app: App) {
  // ── The page ────────────────────────────────────────────────────────────
  app.get("/p/:slug", async (c) => {
    const slug = c.req.param("slug");

    // Served on a custom hostname, the same document answers for whichever page
    // claimed that hostname, so a client's domain never shows another client's
    // page even if someone guesses a slug.
    const host = new URL(c.req.url).hostname;
    const page = await get<RenderPage & { published: number }>(
      `SELECT id, slug, title, subtitle, hostname, avatar_key, theme, footer_name, footer_url, published
         FROM pages
        WHERE slug = ? AND published = 1
          AND (hostname IS NULL OR hostname = ?)`,
      [slug, host],
    );

    if (!page) return c.text("Not found", 404);

    const blocks = await query<RenderBlock>(
      `SELECT id, kind, label, url, meta
         FROM blocks
        WHERE page_id = ? AND active = 1
        ORDER BY position ASC, created_at ASC`,
      [page.id],
    );

    const origin = new URL(c.req.url).origin;
    return c.html(renderPage(page, blocks, origin), 200, { "Cache-Control": PAGE_CACHE });
  });

  // ── The counting redirect ───────────────────────────────────────────────
  // Every link on the page points here. One row, then a 302. No script on the
  // page means no click can be lost to a blocked beacon or a fast tap.
  app.get("/r/:id", async (c) => {
    const id = c.req.param("id");
    const block = await get<{ id: string; org_id: string; page_id: string; url: string; active: number }>(
      `SELECT id, org_id, page_id, url, active FROM blocks WHERE id = ?`,
      [id],
    );

    const destination = block && block.active === 1 ? safeUrl(block.url) : null;
    if (!block || !destination) return c.text("Not found", 404);

    // Referrer is reduced to a host and the country comes from the edge: enough
    // to reorder a page by what works, not enough to follow anyone around.
    let referrer = "";
    try {
      const raw = c.req.header("referer");
      if (raw) referrer = new URL(raw).hostname;
    } catch {
      referrer = "";
    }
    const country = c.req.header("cf-ipcountry") ?? "";

    // A failed write must never cost the visitor their click.
    try {
      await run(
        `INSERT INTO clicks (id, org_id, page_id, block_id, ts, referrer, country)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [uid(), block.org_id, block.page_id, block.id, now(), referrer.slice(0, 120), country.slice(0, 2)],
      );
    } catch (err) {
      console.error("click write failed", err);
    }

    return c.redirect(destination, 302);
  });

  // ── Avatars and the install logo ────────────────────────────────────────
  app.get("/m/:key{.+}", async (c) => {
    const key = c.req.param("key");
    const object = await c.env.UPLOADS.get(key);
    if (!object) return c.text("Not found", 404);
    return new Response(object.body, {
      headers: {
        "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
        "Cache-Control": "public, max-age=86400",
      },
    });
  });

  // ── Email capture ───────────────────────────────────────────────────────
  // Posted by a plain HTML form, so the reply is a redirect back to the page
  // rather than JSON. The block id carries the tenant: a visitor supplies an
  // address and nothing else that the app trusts.
  app.post("/api/public/subscribe", async (c) => {
    const form = await c.req.parseBody();
    const blockId = typeof form.block === "string" ? form.block : "";
    const email = typeof form.email === "string" ? form.email.trim().slice(0, 254) : "";

    if (!blockId || !/^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(email)) {
      return c.text("Bad request", 400);
    }

    const block = await get<{ org_id: string; page_id: string }>(
      `SELECT org_id, page_id FROM blocks WHERE id = ? AND kind = 'email' AND active = 1`,
      [blockId],
    );
    if (!block) return c.text("Not found", 404);

    const page = await get<{ slug: string }>(`SELECT slug FROM pages WHERE id = ?`, [block.page_id]);
    if (!page) return c.text("Not found", 404);

    // A repeat signup is a success from the visitor's side, not a duplicate-key
    // error: the unique index makes that the database's problem, not theirs.
    try {
      await run(
        `INSERT INTO subscribers (id, org_id, page_id, email, created_at) VALUES (?, ?, ?, ?, ?)`,
        [uid(), block.org_id, block.page_id, email, now()],
      );
    } catch {
      // Already subscribed.
    }

    return c.redirect(`/p/${encodeURIComponent(page.slug)}`, 303);
  });
}
