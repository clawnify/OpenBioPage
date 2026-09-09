// The shared vocabulary every route module imports: the bindings, the app type,
// and the few helpers that would otherwise be rewritten per file.

import { OpenAPIHono, z } from "@clawnify/app";

export interface Env {
  Bindings: {
    DB: D1Database;
    /** Per-app bucket holding page avatars and the install's own logo. */
    UPLOADS: R2Bucket;
    /** Minted per org by the platform. Present in production, absent locally. */
    CLAWNIFY_TOKEN?: string;
  };
}

export type App = OpenAPIHono<Env>;

export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();

export const ErrorSchema = z.object({ error: z.string() }).openapi("Error");
export const OkSchema = z.object({ ok: z.boolean() }).openapi("Ok");

export const PaginationQuery = z.object({
  page: z.string().optional().openapi({ description: "Page number (default: 1)" }),
  limit: z.string().optional().openapi({ description: "Items per page (default: 25, max: 100)" }),
  search: z.string().optional().openapi({ description: "Filter by title or slug" }),
});

export function paginate(q: { page?: string; limit?: string }): { limit: number; offset: number; page: number } {
  const page = Math.max(1, Number(q.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(q.limit) || 25));
  return { page, limit, offset: (page - 1) * limit };
}

export function ok<T extends z.ZodTypeAny>(description: string, schema: T) {
  return { description, content: { "application/json": { schema } } };
}

export function fail(description: string) {
  return { description, content: { "application/json": { schema: ErrorSchema } } };
}

/**
 * URL-safe handle for a page's public path. Uniqueness is the database's job,
 * not this function's — it only has to produce something readable to start from.
 */
export function slugify(text: string): string {
  return (
    text
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "page"
  );
}
