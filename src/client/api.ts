// One fetch wrapper. Auth is the platform's job at the perimeter, so there is
// no token to attach and no login to build here.

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export interface PageRow {
  id: string;
  slug: string;
  title: string;
  hostname: string | null;
  published: number;
  updated_at: string;
  blocks: number;
  broken: number;
  clicks_7d: number;
  clicks_30d: number;
}

export interface BlockStat {
  id: string;
  label: string;
  kind: string;
  url: string;
  position: number;
  active: number;
  check_status: number | null;
  clicks_30d: number;
}

export interface TemplateRow {
  slug: string;
  name: string;
  tagline: string;
  builtin: boolean;
  theme: string;
}

export const api = {
  templates: () => request<{ items: TemplateRow[] }>("/api/templates"),
  addTemplate: (markdown: string) =>
    request<TemplateRow>("/api/templates", { method: "POST", body: JSON.stringify({ markdown }) }),
  deleteTemplate: (slug: string) =>
    request<{ deleted: boolean }>(`/api/templates/${encodeURIComponent(slug)}`, { method: "DELETE" }),
  overview: (limit = 25) => request<{ items: PageRow[]; total: number; page: number }>(`/api/overview?limit=${limit}`),
  pageStats: (id: string) => request<{ items: BlockStat[]; total_clicks_30d: number }>(`/api/pages/${id}/stats`),
  createPage: (body: { title: string; slug?: string }) => request<{ id: string }>("/api/pages", { method: "POST", body: JSON.stringify(body) }),
  checkLinks: (id: string) =>
    request<{ checked: number; broken: { id: string; label: string; url: string; status: number }[] }>(
      `/api/pages/${id}/check`,
      { method: "POST" },
    ),
  reorder: (pageId: string, ids: string[]) =>
    request<{ ok: boolean }>(`/api/pages/${pageId}/blocks/order`, { method: "POST", body: JSON.stringify({ ids }) }),
};
