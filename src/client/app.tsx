import { useCallback, useEffect, useState } from "react";
import { AppNav, reportLocation, type AppNavItem } from "@clawnify/app/client";
import { api, type BlockStat, type PageRow, type TemplateRow } from "./api";

const NAV: AppNavItem[] = [
  { id: "overview", label: "Overview", href: "/", home: true },
  { id: "pages", label: "Pages", href: "/pages", icon: "link", color: "violet" },
  { id: "templates", label: "Templates", href: "/templates", icon: "palette", color: "amber" },
  { id: "settings", label: "Settings", href: "/settings", icon: "settings" },
];

/** Weeks since a page was last edited. The number an agency is actually judged on. */
function staleWeeks(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (7 * 86_400_000));
}

export function App() {
  const [rows, setRows] = useState<PageRow[]>([]);
  const [selected, setSelected] = useState<PageRow | null>(null);
  const [view, setView] = useState<"overview" | "templates">("overview");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await api.overview();
      setRows(data.items);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    reportLocation(window.location.pathname);
  }, [load]);

  const totalBroken = rows.reduce((n, r) => n + r.broken, 0);
  const totalClicks = rows.reduce((n, r) => n + r.clicks_7d, 0);
  const stale = rows.filter((r) => staleWeeks(r.updated_at) >= 8).length;

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <AppNav
        title="OpenPerch"
        icon="link"
        groups={[{ items: NAV }]}
        active={view === "templates" ? "templates" : selected ? "pages" : "overview"}
        onNavigate={(item) => {
          setSelected(null);
          setView(item.id === "templates" ? "templates" : "overview");
        }}
      />

      <main className="min-w-0 flex-1 p-6 md:p-8">
        <h1 className="text-[1.375rem] font-semibold tracking-[-0.01em]">
          {selected ? selected.title : view === "templates" ? "Templates" : "Overview"}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {selected
            ? "Clicks by row over the last 30 days, busiest first."
            : view === "templates"
              ? "Every look a page can wear. Download one as markdown to edit it."
              : "Every page you run, stalest first."}
        </p>

        {error && (
          <div className="mt-6 rounded-lg bg-danger-tint px-4 py-3 text-sm text-danger">{error}</div>
        )}

        {selected ? (
          <PageDetail page={selected} onBack={() => setSelected(null)} />
        ) : view === "templates" ? (
          <Templates />
        ) : (
          <>
            <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
              <Tile label="PAGES" value={rows.length} />
              <Tile label="CLICKS, 7 DAYS" value={totalClicks} />
              <Tile label="BROKEN LINKS" value={totalBroken} tone={totalBroken ? "danger" : undefined} />
              <Tile label="STALE OVER 8 WEEKS" value={stale} tone={stale ? "warning" : undefined} />
            </div>

            <section className="card mt-6">
              <header className="flex items-center justify-between px-5 py-4">
                <h2 className="text-[1.0625rem] font-semibold">Pages</h2>
              </header>
              {loading ? (
                <p className="px-5 pb-5 text-sm text-muted">Loading.</p>
              ) : rows.length === 0 ? (
                <p className="px-5 pb-5 text-sm text-muted">
                  No pages yet. Ask your agent to create one, or add it from the API.
                </p>
              ) : (
                <ul>
                  {rows.map((row) => (
                    <li key={row.id} className="border-t border-border first:border-t-0">
                      <button
                        type="button"
                        onClick={() => setSelected(row)}
                        className="flex h-12 w-full items-center gap-3 px-5 text-left hover:bg-sunken focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{row.title}</span>
                        <span className="hidden truncate text-sm text-faint md:block">
                          {row.hostname ?? `/p/${row.slug}`}
                        </span>
                        {row.broken > 0 && <Badge tone="danger">{row.broken} broken</Badge>}
                        {staleWeeks(row.updated_at) >= 8 && (
                          <Badge tone="warning">{staleWeeks(row.updated_at)}w stale</Badge>
                        )}
                        <span className="tnum w-16 text-right text-sm text-muted">{row.clicks_7d}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function PageDetail({ page, onBack }: { page: PageRow; onBack: () => void }) {
  const [stats, setStats] = useState<BlockStat[]>([]);
  const [total, setTotal] = useState(0);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    void api.pageStats(page.id).then((d) => {
      setStats(d.items);
      setTotal(d.total_clicks_30d);
    });
  }, [page.id]);

  return (
    <>
      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-md px-3 py-1.5 text-sm text-muted hover:bg-sunken"
        >
          Back
        </button>
        {/* The one ink action on this screen. */}
        <button
          type="button"
          disabled={checking}
          onClick={async () => {
            setChecking(true);
            try {
              await api.checkLinks(page.id);
              const d = await api.pageStats(page.id);
              setStats(d.items);
            } finally {
              setChecking(false);
            }
          }}
          className="h-7 rounded-sm bg-primary px-3 text-sm font-medium text-on-primary hover:bg-primary-hover disabled:opacity-60"
        >
          {checking ? "Checking" : "Check links"}
        </button>
      </div>

      <section className="card mt-6">
        <header className="px-5 py-4">
          <h2 className="text-[1.0625rem] font-semibold">Rows by clicks</h2>
        </header>
        <ul>
          {stats.map((b) => (
            <li key={b.id} className="flex h-12 items-center gap-3 border-t border-border px-5">
              <span className="min-w-0 flex-1 truncate text-sm">{b.label}</span>
              {b.check_status !== null && b.check_status >= 400 && (
                <Badge tone="danger">{b.check_status === 599 ? "no answer" : b.check_status}</Badge>
              )}
              {b.active === 0 && <Badge>hidden</Badge>}
              <span className="tnum w-16 text-right text-sm">{b.clicks_30d}</span>
            </li>
          ))}
        </ul>
        <footer className="flex h-12 items-center border-t border-border px-5 text-sm text-muted">
          <span className="flex-1">30-day total</span>
          <span className="tnum w-16 text-right">{total}</span>
        </footer>
      </section>
    </>
  );
}

function Tile({ label, value, tone }: { label: string; value: number; tone?: "danger" | "warning" }) {
  const tint = tone === "danger" ? "bg-danger-tint" : tone === "warning" ? "bg-warning-tint" : "card";
  return (
    <div className={`rounded-xl px-4 py-3 ${tint}`}>
      <div className="tnum text-xl font-semibold">{value}</div>
      <div className="mt-0.5 text-[0.6875rem] tracking-[0.02em] text-muted">{label}</div>
    </div>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone?: "danger" | "warning" }) {
  const cls =
    tone === "danger"
      ? "bg-danger-tint text-danger"
      : tone === "warning"
        ? "bg-warning-tint text-warning"
        : "bg-sunken text-muted";
  return <span className={`rounded-sm px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}

/** Phone width the preview renders at before being scaled into the card. */
const PREVIEW_WIDTH = 390;

/**
 * Scale that fits a `PREVIEW_WIDTH` frame into however wide the card actually
 * is. A fixed factor clipped the right edge on narrow columns and left a gap on
 * wide ones, and the grid is responsive, so the number has to come from the
 * element rather than from a guess.
 */
function usePreviewScale() {
  const [scale, setScale] = useState(0.6);
  const ref = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      setScale(entry.contentRect.width / PREVIEW_WIDTH);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return { ref, scale };
}

/**
 * The gallery. Each card previews through the real public renderer in an
 * iframe, so what you see here is what a visitor gets rather than a mock that
 * drifts from it.
 */
function Templates() {
  const [items, setItems] = useState<TemplateRow[]>([]);
  const [markdown, setMarkdown] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    void api.templates().then(
      (d) => setItems(d.items),
      (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
    );
  }, []);

  useEffect(load, [load]);

  async function add() {
    setBusy(true);
    setError(null);
    try {
      await api.addTemplate(markdown);
      setMarkdown("");
      setAdding(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(slug: string) {
    await api.deleteTemplate(slug);
    load();
  }

  return (
    <>
      <div className="mt-6 flex items-center gap-2">
        <button type="button" className="h-7 rounded-sm bg-primary px-3 text-sm font-medium text-on-primary hover:bg-primary-hover disabled:opacity-60" onClick={() => setAdding((v) => !v)}>
          {adding ? "Cancel" : "Add a template"}
        </button>
        <p className="text-sm text-muted">
          Download any card as markdown, edit it (or have your agent edit it), and paste it back.
        </p>
      </div>

      {adding && (
        <section className="card mt-4 p-5">
          <label htmlFor="template-md" className="text-sm font-medium">
            Paste a template
          </label>
          <p className="mt-1 text-sm text-muted">
            A <code>---</code> frontmatter block with the fields, then any notes you want the next
            editor to read.
          </p>
          <textarea
            id="template-md"
            value={markdown}
            onChange={(e) => setMarkdown(e.currentTarget.value)}
            rows={10}
            spellCheck={false}
            placeholder={"---\nslug: client-brand\nname: Client Brand\ntagline: What it is for\nbackground: \"#ffffff\"\naccent: \"#1b1a19\"\nfont: sans\nbutton: outline\ncorner: round\n---\n\nWhat matters about this look."}
            className="mt-3 w-full rounded-md bg-sunken p-3 font-mono text-xs shadow-[inset_0_0_0_1px_var(--border)] focus-visible:outline-2 focus-visible:outline-ring"
          />
          <button
            type="button"
            className="mt-3 h-7 rounded-sm bg-primary px-3 text-sm font-medium text-on-primary hover:bg-primary-hover disabled:opacity-60"
            disabled={busy || markdown.trim() === ""}
            onClick={() => void add()}
          >
            {busy ? "Saving." : "Save template"}
          </button>
        </section>
      )}

      {error && <div className="mt-4 rounded-lg bg-danger-tint px-4 py-3 text-sm text-danger">{error}</div>}

      <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.map((t) => (
          <TemplateCard key={t.slug} template={t} onDelete={() => void remove(t.slug)} />
        ))}
      </div>
    </>
  );
}

function TemplateCard({ template: t, onDelete }: { template: TemplateRow; onDelete: () => void }) {
  const { ref, scale } = usePreviewScale();

  return (
    <article className="card overflow-hidden">
      <div
        ref={ref}
        className="overflow-hidden border-b border-border bg-sunken"
        style={{ height: 470 * scale }}
      >
        <iframe
          src={`/api/templates/${encodeURIComponent(t.slug)}/preview`}
          title={`${t.name} preview`}
          loading="lazy"
          tabIndex={-1}
          // The frame is a picture, not a document to read: no scrollbar, and
          // nothing inside it takes focus away from the card.
          scrolling="no"
          className="pointer-events-none origin-top-left border-0"
          style={{ width: PREVIEW_WIDTH, height: 470, transform: `scale(${scale})` }}
        />
      </div>
      <div className="p-4">
        <div className="flex items-baseline gap-2">
          <h3 className="text-sm font-semibold">{t.name}</h3>
          {!t.builtin && <Badge tone="warning">yours</Badge>}
        </div>
        <p className="mt-1 line-clamp-2 text-xs text-muted">{t.tagline}</p>
        <div className="mt-3 flex items-center gap-3 text-xs">
          <a
            className="text-accent hover:underline"
            href={`/api/templates/${encodeURIComponent(t.slug)}/markdown`}
            download
          >
            Download .md
          </a>
          <code className="text-faint">{t.slug}</code>
          {!t.builtin && (
            <button type="button" className="ml-auto text-danger hover:underline" onClick={onDelete}>
              Delete
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
