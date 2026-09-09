// Images: the page avatar, and the photograph a hero header is built on.
//
// One route, because both are the same thing to R2 and the difference is only
// which theme or column ends up holding the key.

import { createRoute, orgId, z } from "@clawnify/app";
import { fail, ok, uid, type App } from "../env.js";

/** What a browser will actually render, and nothing that executes. */
const TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
};

/** Big enough for a phone photo, small enough that a page still paints fast. */
const MAX_BYTES = 5 * 1024 * 1024;

export function registerUploads(app: App) {
  const upload = createRoute({
    method: "post",
    path: "/api/uploads",
    tags: ["Uploads"],
    summary: "Store an image and get back the key a page or theme can point at",
    request: {
      body: { content: { "image/*": { schema: z.string().openapi({ format: "binary" }) } } },
    },
    responses: {
      200: ok("The stored image", z.object({ key: z.string(), url: z.string() })),
      400: fail("Not an image this app will serve"),
      403: fail("No organisation"),
      413: fail("Too large"),
    },
  });

  app.openapi(upload, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);

    // The declared type decides the extension, and an undeclared or unknown one
    // is refused rather than guessed: this bucket is served straight back to
    // browsers, so a wrong guess is the whole attack.
    const type = (c.req.header("content-type") ?? "").split(";")[0].trim().toLowerCase();
    const ext = TYPES[type];
    if (!ext) return c.json({ error: `Upload a JPEG, PNG, WebP, AVIF or GIF, not "${type || "nothing"}"` }, 400);

    const body = await c.req.arrayBuffer();
    if (body.byteLength === 0) return c.json({ error: "The upload was empty" }, 400);
    if (body.byteLength > MAX_BYTES) {
      return c.json({ error: `Images are capped at ${MAX_BYTES / 1024 / 1024} MB` }, 413);
    }

    // Keyed by org so one install's images can never be addressed from another,
    // even though the serving route is public.
    const key = `${org}/${uid()}.${ext}`;
    await c.env.UPLOADS.put(key, body, { httpMetadata: { contentType: type } });

    return c.json({ key, url: `/m/${key}` } as never);
  });
}
