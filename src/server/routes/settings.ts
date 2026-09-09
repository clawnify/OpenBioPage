// Install-wide defaults. One row per org, created on first write.
//
// The footer credit lives here so a new client page is signed without anyone
// remembering to sign it; a page can still override it field by field.

import { createRoute, orgId, z } from "@clawnify/app";
import { get, run } from "../db.js";
import { fail, now, ok, type App } from "../env.js";

const SettingsSchema = z
  .object({
    footer_name: z.string(),
    footer_url: z.string(),
    logo_key: z.string().nullable(),
    updated_at: z.string(),
  })
  .openapi("Settings");

const EMPTY = { footer_name: "", footer_url: "", logo_key: null, updated_at: "" };

export function registerSettings(app: App) {
  const read = createRoute({
    method: "get",
    path: "/api/settings",
    tags: ["Settings"],
    summary: "The install's default footer credit",
    responses: { 200: ok("The settings", SettingsSchema), 403: fail("No organisation") },
  });

  app.openapi(read, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);
    const row = await get(`SELECT footer_name, footer_url, logo_key, updated_at FROM settings WHERE org_id = ?`, [org]);
    return c.json((row ?? EMPTY) as never);
  });

  const write = createRoute({
    method: "put",
    path: "/api/settings",
    tags: ["Settings"],
    summary: "Set the default footer credit for new pages",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              footer_name: z.string().max(120),
              footer_url: z.string().max(300).default(""),
            }),
          },
        },
      },
    },
    responses: { 200: ok("The settings", SettingsSchema), 403: fail("No organisation") },
  });

  app.openapi(write, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);
    const body = c.req.valid("json");
    const ts = now();

    await run(
      `INSERT INTO settings (org_id, footer_name, footer_url, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(org_id) DO UPDATE SET footer_name = excluded.footer_name,
                                         footer_url = excluded.footer_url,
                                         updated_at = excluded.updated_at`,
      [org, body.footer_name, body.footer_url, ts],
    );

    const row = await get(`SELECT footer_name, footer_url, logo_key, updated_at FROM settings WHERE org_id = ?`, [org]);
    return c.json(row as never);
  });
}
