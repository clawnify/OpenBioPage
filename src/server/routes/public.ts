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
import { customThemeFor } from "../page-theme.js";
import { readSocials } from "../socials.js";
import { qrSvg } from "../qr.js";
import { cardHtml } from "../card.js";
import { readContact, vcard } from "../vcard.js";

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
    const page = await get<RenderPage & { org_id: string; published: number }>(
      `SELECT id, org_id, slug, title, subtitle, hostname, avatar_key, theme, footer_name, footer_url, published
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
    return c.html(renderPage(page, blocks, origin, await customThemeFor(page.org_id, page.theme)), 200, { "Cache-Control": PAGE_CACHE });
  });

  // ── The card, and the code that points at the page ──────────────────────
  //
  // Both sit under /p/*, which is already a public route, and both are
  // registered before /p/:slug so the slug pattern does not swallow them.

  app.get("/p/:slug/contact.vcf", async (c) => {
    const host = new URL(c.req.url).hostname;
    const page = await get<{ title: string; contact: string }>(
      `SELECT title, contact FROM pages
        WHERE slug = ? AND published = 1 AND (hostname IS NULL OR hostname = ?)`,
      [c.req.param("slug"), host],
    );
    if (!page) return c.text("Not found", 404);

    const contact = readContact(page.contact);
    // The page's own title is the fallback name. Someone who added a Save
    // contact row wants a card, and a card naming only the page is more use to
    // them than a 404 — so this route answers for any published page, and the
    // editor says as much rather than promising it will not.
    const card = vcard({ ...contact, name: contact.name || page.title });
    if (!card) return c.text("Not found", 404);

    return new Response(card, {
      headers: {
        "content-type": "text/vcard; charset=utf-8",
        "content-disposition": `attachment; filename="${c.req.param("slug")}.vcf"`,
        "cache-control": "public, max-age=300",
      },
    });
  });

  app.get("/p/:slug/card", async (c) => {
    const url = new URL(c.req.url);
    const page = await get<{ slug: string; title: string; contact: string; avatar_key: string | null; theme: string }>(
      `SELECT slug, title, contact, avatar_key, theme FROM pages
        WHERE slug = ? AND published = 1 AND (hostname IS NULL OR hostname = ?)`,
      [c.req.param("slug"), url.hostname],
    );
    if (!page) return c.text("Not found", 404);

    const contact = readContact(page.contact);
    let cardColour = "#111111";
    try {
      const t = JSON.parse(page.theme || "{}") as { card?: string };
      if (typeof t.card === "string") cardColour = t.card;
    } catch {
      // A card without a chosen colour is still a card.
    }

    // The avatar is inlined as a data URI rather than linked. A printable file
    // that fetches an image over the network prints as a blank square the
    // first time it is opened somewhere without that network.
    let avatar: string | undefined;
    if (page.avatar_key) {
      const object = await c.env.UPLOADS.get(page.avatar_key);
      if (object) {
        const bytes = new Uint8Array(await object.arrayBuffer());
        // Only worth inlining while it stays small; a 4 MB photo would make
        // the card slower to open than it is to hand over.
        if (bytes.byteLength <= 512 * 1024) {
          let binary = "";
          for (const b of bytes) binary += String.fromCharCode(b);
          const type = object.httpMetadata?.contentType ?? "image/png";
          avatar = `data:${type};base64,${btoa(binary)}`;
        }
      }
    }

    const html = cardHtml({
      name: contact.name || page.title,
      title: contact.title,
      org: contact.org,
      email: contact.email,
      phone: contact.phone,
      url: `${url.origin}/p/${encodeURIComponent(page.slug)}`,
      background: cardColour,
      avatar,
    });

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  });

  app.get("/p/:slug/qr.svg", async (c) => {
    const url = new URL(c.req.url);
    const page = await get<{ slug: string }>(
      `SELECT slug FROM pages
        WHERE slug = ? AND published = 1 AND (hostname IS NULL OR hostname = ?)`,
      [c.req.param("slug"), url.hostname],
    );
    if (!page) return c.text("Not found", 404);

    // The code points at the page on whichever hostname it was asked from, so
    // a card printed from the custom domain does not send people to the
    // platform one.
    const target = `${url.origin}/p/${encodeURIComponent(page.slug)}`;
    return new Response(qrSvg(target, { size: 512 }), {
      headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=3600" },
    });
  });

  // ── The counting redirect ───────────────────────────────────────────────
  // Every link on the page points here. One row, then a 302. No script on the
  // page means no click can be lost to a blocked beacon or a fast tap.
  // `/r/{block}` is a plain link; `/r/{block}/{target}` is one entry inside a
  // block that holds several, which today means a social mark.
  app.get("/r/:id/:target?", async (c) => {
    const id = c.req.param("id");
    const target = c.req.param("target") ?? "";
    const block = await get<{ id: string; org_id: string; page_id: string; url: string; meta: string; active: number }>(
      `SELECT id, org_id, page_id, url, meta, active FROM blocks WHERE id = ?`,
      [id],
    );

    const destination =
      block && block.active === 1
        ? target
          ? safeUrl(readSocials(block.meta).find((s) => s.p === target)?.url ?? "")
          : safeUrl(block.url)
        : null;
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
        `INSERT INTO clicks (id, org_id, page_id, block_id, ts, referrer, country, target)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [uid(), block.org_id, block.page_id, block.id, now(), referrer.slice(0, 120), country.slice(0, 2), target.slice(0, 40)],
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

