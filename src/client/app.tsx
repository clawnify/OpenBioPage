import { useCallback, useEffect, useState } from "react";
import { AppNav, reportLocation, type AppNavItem } from "@clawnify/app/client";
import { api, type Block, type BlockKind, type BlockStat, type Page, type PageRow, type TemplateRow } from "./api";

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

/**
 * Which screen a path names. The nav has always declared these hrefs; until now
 * nothing read them, so a deep link opened the overview, the back button left
 * the app, and a page being edited could not be linked to.
 */
function routeOf(path: string): { view: "overview" | "templates"; pageId: string | null } {
  const edit = /^\/pages\/([\w-]+)$/.exec(path);
  if (edit) return { view: "overview", pageId: edit[1] };
  return { view: path === "/templates" ? "templates" : "overview", pageId: null };
}

export function App() {
  const [rows, setRows] = useState<PageRow[]>([]);
  const [selected, setSelected] = useState<PageRow | null>(null);
  const [view, setView] = useState<"overview" | "templates">(() => routeOf(window.location.pathname).view);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  /** Change screen and say so in the address bar, so the two never disagree. */
  const go = useCallback((path: string, next: { view?: "overview" | "templates"; page?: PageRow | null }) => {
    if (window.location.pathname !== path) window.history.pushState({}, "", path);
    reportLocation(path);
    if (next.view !== undefined) setView(next.view);
    if (next.page !== undefined) setSelected(next.page);
  }, []);

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

  // Back and forward move between screens rather than out of the app.
  useEffect(() => {
    const onPop = () => {
      const r = routeOf(window.location.pathname);
      setView(r.view);
      setSelected(r.pageId ? (rows.find((p) => p.id === r.pageId) ?? null) : null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [rows]);

  // A page opened by URL can only be resolved once the list has arrived.
  useEffect(() => {
    const { pageId } = routeOf(window.location.pathname);
    if (pageId && !selected) setSelected(rows.find((p) => p.id === pageId) ?? null);
  }, [rows, selected]);

  const totalBroken = rows.reduce((n, r) => n + r.broken, 0);
  const totalClicks = rows.reduce((n, r) => n + r.clicks_7d, 0);
  const stale = rows.filter((r) => staleWeeks(r.updated_at) >= 8).length;

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <AppNav
        title="OpenBioPage"
        icon="link"
        groups={[{ items: NAV }]}
        active={view === "templates" ? "templates" : selected ? "pages" : "overview"}
        onNavigate={(item) => {
          const templates = item.id === "templates";
          go(templates ? "/templates" : "/", { view: templates ? "templates" : "overview", page: null });
        }}
      />

      <main className="min-w-0 flex-1 p-6 md:p-8">
        <h1 className="text-[1.375rem] font-semibold tracking-[-0.01em]">
          {selected ? selected.title : view === "templates" ? "Templates" : "Overview"}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {selected
            ? "Build the page on the left; the preview is the page itself."
            : view === "templates"
              ? "Every look a page can wear. Download one as markdown to edit it."
              : "Every page you run, stalest first."}
        </p>

        {error && (
          <div className="mt-6 rounded-lg bg-danger-tint px-4 py-3 text-sm text-danger">{error}</div>
        )}

        {selected ? (
          <PageEditor page={selected} onBack={() => go("/", { view: "overview", page: null })} onChanged={load} />
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
                <NewPage onCreated={load} onOpen={(p) => go(`/pages/${p.id}`, { page: p })} />
              </header>
              {loading ? (
                <p className="px-5 pb-5 text-sm text-muted">Loading.</p>
              ) : rows.length === 0 ? (
                <p className="px-5 pb-5 text-sm text-muted">
                  No pages yet. Add the first one, or ask your agent to.
                </p>
              ) : (
                <ul>
                  {rows.map((row) => (
                    <li key={row.id} className="border-t border-border first:border-t-0">
                      <button
                        type="button"
                        onClick={() => go(`/pages/${row.id}`, { page: row })}
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

function PageStats({ pageId }: { pageId: string }) {
  const [stats, setStats] = useState<BlockStat[]>([]);
  const [total, setTotal] = useState(0);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    void api.pageStats(pageId).then((d) => {
      setStats(d.items);
      setTotal(d.total_clicks_30d);
    });
  }, [pageId]);

  return (
    <>
      <div className="mt-5 flex items-center gap-3">
        {/* The one ink action on this screen. */}
        <button
          type="button"
          disabled={checking}
          onClick={async () => {
            setChecking(true);
            try {
              await api.checkLinks(pageId);
              const d = await api.pageStats(pageId);
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

      <section className="card mt-5">
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

/** The row kinds, in the order the "add" buttons offer them. */
const KINDS: { kind: BlockKind; label: string; hint: string }[] = [
  { kind: "link", label: "Link", hint: "A button that goes somewhere and counts the click." },
  { kind: "header", label: "Header", hint: "A caption that divides the page into sections." },
  { kind: "embed", label: "Embed", hint: "A video, played in place." },
  { kind: "email", label: "Email capture", hint: "One field and a button. Addresses land in this app." },
];

/**
 * The editor. Rows on the left, the real page on the right.
 *
 * Every change is saved as it is made rather than behind a Save button: there
 * is no draft state to lose, and the preview beside it is the confirmation.
 */function PageEditor({ page: initial, onBack, onChanged }: { page: PageRow; onBack: () => void; onChanged: () => void }) {
  const [page, setPage] = useState<Page | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [clicks, setClicks] = useState<Record<string, number>>({});
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [panel, setPanel] = useState<"rows" | "design">("rows");
  const [error, setError] = useState<string | null>(null);
  const [rev, setRev] = useState(0);

  const refresh = useCallback(async () => {
    const [p, b, s] = await Promise.all([api.page(initial.id), api.blocks(initial.id), api.pageStats(initial.id)]);
    setPage(p);
    setBlocks(b.items);
    // Clicks belong on the row they describe, not on a separate screen: the
    // number is why you would edit that row in the first place.
    setClicks(Object.fromEntries(s.items.map((r) => [r.id, r.clicks_30d])));
    setRev((n) => n + 1);
    onChanged();
  }, [initial.id, onChanged]);

  useEffect(() => {
    void refresh().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    void api.templates().then((d) => setTemplates(d.items));
  }, [refresh]);

  const write = useCallback(
    async (fn: () => Promise<unknown>) => {
      try {
        await fn();
        await refresh();
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [refresh],
  );

  function move(index: number, delta: number) {
    const next = [...blocks];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setBlocks(next);
    void write(() => api.reorder(initial.id, next.map((b) => b.id)));
  }

  const preset = (() => {
    try {
      return (JSON.parse(page?.theme ?? "{}") as { preset?: string }).preset ?? "";
    } catch {
      return "";
    }
  })();

  return (
    <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onBack} className="h-8 rounded-md px-2.5 text-sm text-muted hover:bg-sunken">
            ← Pages
          </button>
          <div className="flex rounded-md bg-sunken p-0.5">
            {(["rows", "design"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setPanel(t)}
                aria-pressed={panel === t}
                className={`h-7 rounded-[5px] px-3 text-sm capitalize ${panel === t ? "bg-surface font-medium shadow-[inset_0_0_0_1px_var(--border)]" : "text-muted"}`}
              >
                {t}
              </button>
            ))}
          </div>
          {page && (
            <span className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => void write(() => api.patchPage(page.id, { published: page.published ? 0 : 1 }))}
                className="h-8 rounded-md px-3 text-sm font-medium shadow-[inset_0_0_0_1px_var(--border)] hover:bg-sunken"
              >
                {page.published ? "Unpublish" : "Publish"}
              </button>
              <a
                href={`/p/${page.slug}`}
                target="_blank"
                rel="noreferrer"
                className="h-8 rounded-md bg-primary px-3 text-sm font-medium leading-8 text-on-primary hover:bg-primary-hover"
              >
                Open
              </a>
            </span>
          )}
        </div>

        {error && <div className="mt-4 rounded-lg bg-danger-tint px-4 py-3 text-sm text-danger">{error}</div>}

        {page && <Profile page={page} onPatch={(b) => void write(() => api.patchPage(page.id, b))} />}

        {panel === "design" ? (
          <Design
            preset={preset}
            theme={page?.theme ?? "{}"}
            templates={templates}
            onPick={(slug) => page && void write(() => api.patchPage(page.id, { theme: mergeTheme(page.theme, { preset: slug }) }))}
            onTheme={(patch) => page && void write(() => api.patchPage(page.id, { theme: mergeTheme(page.theme, patch) }))}
          />
        ) : (
          <>
            <div className="mt-4 flex flex-wrap gap-2">
              {KINDS.map((k) => (
                <button
                  key={k.kind}
                  type="button"
                  title={k.hint}
                  onClick={() =>
                    void write(() =>
                      api.addBlock(initial.id, {
                        kind: k.kind,
                        label: k.kind === "header" ? "Section" : k.kind === "email" ? "Get the newsletter" : "New link",
                        // A link and an embed are refused without one, and a
                        // placeholder is easier to replace than an error.
                        url: k.kind === "link" || k.kind === "embed" ? "https://example.com" : undefined,
                      }),
                    )
                  }
                  className={`h-9 rounded-md px-3.5 text-sm font-medium ${k.kind === "link" ? "bg-primary text-on-primary hover:bg-primary-hover" : "shadow-[inset_0_0_0_1px_var(--border)] hover:bg-sunken"}`}
                >
                  + {k.label}
                </button>
              ))}
            </div>

            {blocks.length === 0 ? (
              <p className="card mt-4 px-5 py-8 text-center text-sm text-muted">
                Nothing on the page yet. Add the first row above.
              </p>
            ) : (
              <ul className="mt-4 flex flex-col gap-3">
                {blocks.map((b, i) => (
                  <BlockCard
                    key={b.id}
                    block={b}
                    clicks={clicks[b.id] ?? 0}
                    first={i === 0}
                    last={i === blocks.length - 1}
                    onMove={(d) => move(i, d)}
                    onPatch={(body) => void write(() => api.patchBlock(b.id, body))}
                    onDelete={() => void write(() => api.deleteBlock(b.id))}
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <aside className="lg:sticky lg:top-8 lg:self-start">
        <Phone src={`/api/pages/${initial.id}/preview`} rev={rev} live={!!page?.published} />
      </aside>
    </div>
  );
}

/**
 * The preview, at the width almost every visitor arrives on. No device frame:
 * a page judged in a desktop-width box is judged at a width nobody sees it at,
 * but the chrome around it is decoration and gets in the way of the page.
 */
function Phone({ src, rev, live }: { src: string; rev: number; live: boolean }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold">Preview</h2>
        <span className="text-xs text-faint">{live ? "Live" : "Draft"}</span>
      </div>
      <div className="card mx-auto w-[320px] overflow-hidden">
        <iframe
          key={rev}
          src={src}
          title="Page preview"
          scrolling="no"
          className="block w-full border-0"
          style={{ height: 600 }}
        />
      </div>
    </div>
  );
}

/** The page's own identity, edited where you see it. */
function Profile({ page, onPatch }: { page: Page; onPatch: (b: Partial<Page>) => void }) {
  return (
    <section className="card mt-4 flex items-start gap-4 p-5">
      <div
        aria-hidden
        className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-sunken text-lg font-semibold text-muted"
      >
        {page.title.slice(0, 1).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <InlineEdit
          value={page.title}
          onCommit={(v) => v && v !== page.title && onPatch({ title: v })}
          className="text-[1.0625rem] font-semibold"
          label="Page title"
        />
        <InlineEdit
          value={page.subtitle}
          placeholder="Add a bio"
          onCommit={(v) => v !== page.subtitle && onPatch({ subtitle: v })}
          className="text-sm text-muted"
          label="Bio"
        />
        <p className="mt-2 font-mono text-xs text-faint">/p/{page.slug}</p>
      </div>
    </section>
  );
}

/**
 * The look, as a list of decisions rather than one dropdown. Today there is a
 * single decision — which template — and it is presented as swatches, because
 * choosing a look from the word "Paper" asks you to remember what Paper is.
 */
function Design({
  preset,
  theme,
  templates,
  onPick,
  onTheme,
}: {
  preset: string;
  theme: string;
  templates: TemplateRow[];
  onPick: (slug: string) => void;
  onTheme: (patch: Record<string, unknown>) => void;
}) {
  let current: Record<string, unknown> = {};
  try {
    current = JSON.parse(theme || "{}") as Record<string, unknown>;
  } catch {
    // An unreadable theme still renders the picker; picking one replaces it.
  }
  const image = typeof current.image === "string" ? current.image : "";

  return (
    <>
    <section className="card mt-4 p-5">
      <h2 className="text-[1.0625rem] font-semibold">Header</h2>
      <p className="mt-1 text-sm text-muted">
        A photograph behind the name, or a round avatar above it.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <ImagePicker
          value={image}
          onPick={(key) => onTheme({ image: key, header: key ? "hero" : "classic" })}
        />
        {image && (
          <label className="text-sm">
            <span className="text-muted">Darken</span>
            <input
              type="range"
              min={0}
              max={92}
              defaultValue={Math.round(Number(current.overlay ?? 0.6) * 100)}
              onChange={(e) => onTheme({ overlay: Number(e.currentTarget.value) / 100 })}
              className="ml-2 align-middle"
              aria-label="Darken the image behind the text"
            />
          </label>
        )}
      </div>
      {image && (
        <p className="mt-2 text-xs text-faint">
          The page will not let this get lighter than the text needs. A photo cannot be
          contrast-checked, so the darkening is what keeps the words readable on the next one.
        </p>
      )}
    </section>

    <section className="card mt-4 p-5">
      <h2 className="text-[1.0625rem] font-semibold">Template</h2>
      <p className="mt-1 text-sm text-muted">
        The whole look: typeface, buttons, corners, canvas. Edit one as markdown under Templates.
      </p>
      <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {templates.map((t) => (
          <li key={t.slug}>
            <button
              type="button"
              onClick={() => onPick(t.slug)}
              aria-pressed={preset === t.slug}
              className={`w-full overflow-hidden rounded-lg text-left ${preset === t.slug ? "shadow-[0_0_0_2px_var(--primary)]" : "shadow-[inset_0_0_0_1px_var(--border)] hover:shadow-[inset_0_0_0_1px_var(--ring)]"}`}
            >
              <Swatch theme={t.theme} />
              <span className="block truncate px-2.5 py-2 text-xs font-medium">{t.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
    </>
  );
}

/** Choose, replace or clear the image a hero header is built on. */
function ImagePicker({ value, onPick }: { value: string; onPick: (key: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="flex items-center gap-3">
      {value ? (
        <img src={`/m/${value}`} alt="" className="h-14 w-14 rounded-md object-cover" />
      ) : (
        <span aria-hidden className="grid h-14 w-14 place-items-center rounded-md bg-sunken text-xs text-faint">
          none
        </span>
      )}
      <label className="h-8 cursor-pointer rounded-md px-3 text-sm font-medium leading-8 shadow-[inset_0_0_0_1px_var(--border)] hover:bg-sunken">
        {busy ? "Uploading." : value ? "Replace" : "Upload"}
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={async (e) => {
            const file = e.currentTarget.files?.[0];
            if (!file) return;
            setBusy(true);
            setError(null);
            try {
              onPick((await api.upload(file)).key);
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      {value && (
        <button type="button" onClick={() => onPick("")} className="h-8 rounded-md px-2 text-sm text-muted hover:bg-sunken">
          Remove
        </button>
      )}
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  );
}

/**
 * A template at a glance: its canvas, and two buttons drawn the way it draws
 * them. Small enough to be honest — it claims to show the palette and the
 * button treatment, and it shows exactly those.
 */
/** The same stacks the renderer uses, so a swatch shows the real face. */
const FACES: Record<string, string> = {
  sans: `-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif`,
  serif: `"Iowan Old Style","Palatino Linotype",Palatino,Georgia,"Times New Roman",serif`,
  mono: `ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace`,
  rounded: `ui-rounded,"SF Pro Rounded","Hiragino Maru Gothic ProN",Quicksand,Verdana,sans-serif`,
  condensed: `"Haettenschweiler","Arial Narrow Bold","Helvetica Neue Condensed",Impact,sans-serif`,
};

function Swatch({ theme }: { theme: string }) {
  let t: Record<string, string> = {};
  try {
    t = JSON.parse(theme) as Record<string, string>;
  } catch {
    // A swatch is never worth an error; an unreadable theme draws the default.
  }

  const bg = t.background ?? "#ffffff";
  const fg = t.foreground ?? "#1b1a19";
  const accent = t.accent ?? "#1b1a19";
  const canvas = t.background2 ? `linear-gradient(${t.angle ?? 160}deg,${bg},${t.background2})` : bg;
  const radius = t.corner === "pill" ? 999 : t.corner === "sharp" ? 0 : 6;

  const pill = (filled: boolean): React.CSSProperties =>
    t.button === "fill" || (filled && t.button !== "outline")
      ? { background: accent, borderRadius: radius }
      : t.button === "shadow"
        ? { border: `1.5px solid ${fg}`, boxShadow: `2px 2px 0 0 ${fg}`, borderRadius: radius }
        : { border: `1px solid ${fg}59`, borderRadius: radius };

  return (
    <span className="block px-3 py-3" style={{ background: canvas }}>
      {/* "Aa" in the template's own typeface: the face is half of what makes
          one template different from another, and a coloured blob hides it. */}
      <span
        className="mb-1.5 block text-center text-[1.375rem] leading-none"
        style={{ color: fg, fontFamily: FACES[t.font ?? "sans"] ?? FACES.sans }}
      >
        Aa
      </span>
      <span className="block h-4" style={pill(true)} />
      <span className="mt-1.5 block h-4" style={pill(false)} />
    </span>
  );
}

/**
 * Merge into the page's theme instead of replacing it. Picking a template must
 * not silently drop the photograph someone uploaded, and vice versa. An empty
 * value clears its key rather than storing `""`.
 */
function mergeTheme(theme: string, patch: Record<string, unknown>): string {
  let base: Record<string, unknown> = {};
  try {
    base = JSON.parse(theme || "{}") as Record<string, unknown>;
  } catch {
    // An unreadable theme is replaced by this edit rather than blocking it.
  }
  const next = { ...base, ...patch };
  for (const [k, v] of Object.entries(next)) if (v === "" || v == null) delete next[k];
  return JSON.stringify(next);
}

/** `meta` is a JSON string on the wire; the only field in it today is `note`. */
const UNNAMED = "New link";

function readMeta(meta: string): { note?: string; image?: string } {
  try {
    return JSON.parse(meta) as { note?: string; image?: string };
  } catch {
    return {};
  }
}

function readNote(meta: string): string {
  try {
    return (JSON.parse(meta) as { note?: string }).note ?? "";
  } catch {
    return "";
  }
}

function BlockCard({
  block,
  clicks,
  first,
  last,
  onMove,
  onPatch,
  onDelete,
}: {
  block: Block;
  clicks: number;
  first: boolean;
  last: boolean;
  onMove: (delta: number) => void;
  onPatch: (body: Partial<Pick<Block, "label" | "url" | "meta" | "active">>) => void;
  onDelete: () => void;
}) {
  const takesUrl = block.kind === "link" || block.kind === "embed";
  const takesNote = block.kind === "link";
  const note = readNote(block.meta);
  const image = readMeta(block.meta).image;
  const [reading, setReading] = useState(false);

  /**
   * Save the URL, then ask the destination what it calls itself.
   *
   * The title only lands on a row nobody has named — an unnamed row is a
   * suggestion, a named one is a decision, and overwriting the second would be
   * the app arguing with the person using it. The image is taken either way,
   * because nobody types one.
   */
  async function onEnrich(url: string) {
    onPatch({ url });
    if (block.kind !== "link" || !/^https?:\/\//i.test(url)) return;

    setReading(true);
    try {
      const meta = await api.linkMeta(url);
      const patch: Partial<Pick<Block, "label" | "meta">> = {};
      if (meta.title && block.label === UNNAMED) patch.label = meta.title;
      if (meta.image) patch.meta = JSON.stringify({ ...readMeta(block.meta), image: meta.image });
      if (Object.keys(patch).length) onPatch(patch);
    } catch {
      // The row is already saved; a page that will not describe itself just
      // means the label stays as typed.
    } finally {
      setReading(false);
    }
  }

  return (
    <li className={`card p-4 ${block.active ? "" : "opacity-60"}`}>
      <div className="flex items-start gap-3">
        {image && <img src={`/m/${image}`} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" />}

        <div className="min-w-0 flex-1">
          <InlineEdit
            value={block.label}
            onCommit={(v) => v && v !== block.label && onPatch({ label: v })}
            className="text-sm font-medium"
            label="Label"
          />
          {takesUrl && (
            <InlineEdit
              value={block.url}
              onCommit={(v) => v !== block.url && onEnrich(v)}
              className="font-mono text-xs text-muted"
              label="URL"
            />
          )}
          {takesNote && (
            <InlineEdit
              value={note}
              placeholder="Add a note"
              onCommit={(v) => v !== note && onPatch({ meta: JSON.stringify(v ? { note: v } : {}) })}
              className="text-xs text-muted"
              label="Note"
            />
          )}
        </div>

        <span className="flex shrink-0 items-center gap-3">
          <Badge>{block.kind}</Badge>
          <Switch
            on={block.active === 1}
            label={block.active ? "Hide this row" : "Show this row"}
            onChange={() => onPatch({ active: block.active ? 0 : 1 })}
          />
        </span>
      </div>

      <div className="mt-2.5 flex items-center gap-1 border-t border-border pt-2 text-xs text-muted">
        {/* Order is changed with buttons rather than dragging: the same two
            decisions, and they work from a keyboard. */}
        <IconButton label="Move up" disabled={first} onClick={() => onMove(-1)}>↑</IconButton>
        <IconButton label="Move down" disabled={last} onClick={() => onMove(1)}>↓</IconButton>
        {/* Hiding keeps the history; deleting does not. The count sits at the
            moment of that decision so the difference is visible. */}
        <span className="tnum ml-2">{clicks} clicks, 30 days</span>
        {reading && <span className="text-faint">Reading the page.</span>}
        <button type="button" onClick={onDelete} className="ml-auto rounded-sm px-2 py-1 text-danger hover:bg-danger-tint">
          Delete
        </button>
      </div>
    </li>
  );
}

/**
 * Text that becomes an input when you click it. Committed on Enter or on
 * leaving, abandoned on Escape — never per keystroke, so the preview settles
 * on what you meant rather than flickering through what you typed.
 */
function InlineEdit({
  value,
  onCommit,
  className = "",
  label,
  placeholder,
}: {
  value: string;
  onCommit: (v: string) => void;
  className?: string;
  label: string;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={`${label}: ${value || placeholder || "empty"}. Click to edit.`}
        className={`-mx-1 block w-full truncate rounded-sm px-1 py-0.5 text-left hover:bg-sunken ${className} ${value ? "" : "text-faint"}`}
      >
        {value || placeholder || "—"}
      </button>
    );
  }

  return (
    <input
      autoFocus
      value={draft}
      aria-label={label}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.currentTarget.value)}
      onBlur={() => {
        setEditing(false);
        onCommit(draft.trim());
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setDraft(value);
          setEditing(false);
        }
      }}
      className={`-mx-1 block w-full rounded-sm bg-surface px-1 py-0.5 shadow-[inset_0_0_0_1px_var(--border)] focus-visible:outline-2 focus-visible:outline-ring ${className}`}
    />
  );
}

/** On or off, said in a way a screen reader can read. */
function Switch({ on, label, onChange }: { on: boolean; label: string; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={label}
      onClick={onChange}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${on ? "bg-success" : "bg-sunken shadow-[inset_0_0_0_1px_var(--border)]"}`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-surface shadow-[inset_0_0_0_1px_var(--border)] transition-[left] ${on ? "left-[18px]" : "left-0.5"}`}
      />
    </button>
  );
}

function IconButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="h-5 w-5 rounded-sm text-xs text-faint hover:bg-sunken hover:text-muted disabled:opacity-25"
    >
      {children}
    </button>
  );
}

function NewPage({ onCreated, onOpen }: { onCreated: () => void; onOpen: (p: PageRow) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    try {
      const created = await api.createPage({ title: title.trim() });
      setTitle("");
      setOpen(false);
      onCreated();
      // Straight into the editor: a page with no rows is not a result.
      onOpen({
        id: created.id,
        slug: "",
        title: title.trim(),
        hostname: null,
        published: 0,
        updated_at: new Date().toISOString(),
        blocks: 0,
        broken: 0,
        clicks_7d: 0,
        clicks_30d: 0,
      });
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-7 rounded-sm bg-primary px-3 text-sm font-medium text-on-primary hover:bg-primary-hover"
      >
        New page
      </button>
    );
  }

  return (
    <span className="flex items-center gap-2">
      <input
        autoFocus
        value={title}
        placeholder="Client name"
        onChange={(e) => setTitle(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && title.trim()) void create();
          if (e.key === "Escape") setOpen(false);
        }}
        className="h-7 w-44 rounded-sm bg-surface px-2 text-sm shadow-[inset_0_0_0_1px_var(--border)] focus-visible:outline-2 focus-visible:outline-ring"
      />
      <button
        type="button"
        disabled={busy || !title.trim()}
        onClick={() => void create()}
        className="h-7 rounded-sm bg-primary px-3 text-sm font-medium text-on-primary hover:bg-primary-hover disabled:opacity-60"
      >
        Create
      </button>
      <button type="button" onClick={() => setOpen(false)} className="h-7 rounded-sm px-2 text-sm text-muted hover:bg-sunken">
        Cancel
      </button>
    </span>
  );
}
