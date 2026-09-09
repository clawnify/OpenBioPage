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
            ? "Build the page on the left; the preview is the page itself."
            : view === "templates"
              ? "Every look a page can wear. Download one as markdown to edit it."
              : "Every page you run, stalest first."}
        </p>

        {error && (
          <div className="mt-6 rounded-lg bg-danger-tint px-4 py-3 text-sm text-danger">{error}</div>
        )}

        {selected ? (
          <PageEditor page={selected} onBack={() => setSelected(null)} onChanged={load} />
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
                <NewPage onCreated={load} onOpen={setSelected} />
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

/** `meta` is a JSON string on the wire; the only field in it today is `note`. */
function readNote(meta: string): string {
  try {
    return (JSON.parse(meta) as { note?: string }).note ?? "";
  } catch {
    return "";
  }
}

/**
 * The editor. Rows on the left, the real page on the right.
 *
 * Every change is saved as it is made rather than behind a Save button: there
 * is no draft state to lose, and the preview beside it is the confirmation.
 */
function PageEditor({ page: initial, onBack, onChanged }: { page: PageRow; onBack: () => void; onChanged: () => void }) {
  const [page, setPage] = useState<Page | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [tab, setTab] = useState<"build" | "stats">("build");
  const [error, setError] = useState<string | null>(null);
  // Bumped after every write so the preview iframe refetches.
  const [rev, setRev] = useState(0);

  const refresh = useCallback(async () => {
    const [p, b] = await Promise.all([api.page(initial.id), api.blocks(initial.id)]);
    setPage(p);
    setBlocks(b.items);
    setRev((n) => n + 1);
    onChanged();
  }, [initial.id, onChanged]);

  useEffect(() => {
    void refresh().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    void api.templates().then((d) => setTemplates(d.items));
  }, [refresh]);

  /** Run a write, then reload. Errors surface rather than leaving stale rows. */
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
    <>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={onBack} className="h-7 rounded-sm px-3 text-sm text-muted hover:bg-sunken">
          Back
        </button>
        <div className="flex rounded-sm bg-sunken p-0.5">
          {(["build", "stats"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              aria-pressed={tab === t}
              className={`h-6 rounded-[4px] px-3 text-sm capitalize ${tab === t ? "bg-surface font-medium shadow-[inset_0_0_0_1px_var(--border)]" : "text-muted"}`}
            >
              {t}
            </button>
          ))}
        </div>

        <span className="ml-auto flex items-center gap-2">
          {page && (
            <>
              <button
                type="button"
                onClick={() => void write(() => api.patchPage(page.id, { published: page.published ? 0 : 1 }))}
                className="h-7 rounded-sm px-3 text-sm font-medium shadow-[inset_0_0_0_1px_var(--border)] hover:bg-sunken"
              >
                {page.published ? "Unpublish" : "Publish"}
              </button>
              <a
                href={`/p/${page.slug}`}
                target="_blank"
                rel="noreferrer"
                className="h-7 rounded-sm bg-primary px-3 text-sm font-medium leading-7 text-on-primary hover:bg-primary-hover"
              >
                Open
              </a>
            </>
          )}
        </span>
      </div>

      {error && <div className="mt-4 rounded-lg bg-danger-tint px-4 py-3 text-sm text-danger">{error}</div>}

      {tab === "stats" ? (
        <PageStats pageId={initial.id} />
      ) : (
        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0">
            {page && (
              <section className="card p-5">
                <h2 className="text-[1.0625rem] font-semibold">This page</h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Field
                    label="Title"
                    value={page.title}
                    onCommit={(v) => v !== page.title && void write(() => api.patchPage(page.id, { title: v }))}
                  />
                  <Field
                    label="Subtitle"
                    value={page.subtitle}
                    onCommit={(v) => v !== page.subtitle && void write(() => api.patchPage(page.id, { subtitle: v }))}
                  />
                  <label className="block text-sm">
                    <span className="text-muted">Template</span>
                    <select
                      value={preset}
                      onChange={(e) =>
                        void write(() => api.patchPage(page.id, { theme: JSON.stringify({ preset: e.currentTarget.value }) }))
                      }
                      className="mt-1 h-8 w-full rounded-sm bg-surface px-2 text-sm shadow-[inset_0_0_0_1px_var(--border)]"
                    >
                      <option value="">Default</option>
                      {templates.map((t) => (
                        <option key={t.slug} value={t.slug}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="text-sm">
                    <span className="text-muted">Address</span>
                    <p className="mt-1 flex h-8 items-center font-mono text-xs text-faint">/p/{page.slug}</p>
                  </div>
                </div>
              </section>
            )}

            <section className="card mt-5">
              <header className="flex items-center justify-between px-5 py-4">
                <h2 className="text-[1.0625rem] font-semibold">Rows</h2>
                <span className="text-sm text-muted">{blocks.length}</span>
              </header>

              {blocks.length === 0 ? (
                <p className="px-5 pb-5 text-sm text-muted">
                  Nothing on the page yet. Add the first row below.
                </p>
              ) : (
                <ul>
                  {blocks.map((b, i) => (
                    <BlockRow
                      key={b.id}
                      block={b}
                      first={i === 0}
                      last={i === blocks.length - 1}
                      onMove={(d) => move(i, d)}
                      onPatch={(body) => void write(() => api.patchBlock(b.id, body))}
                      onDelete={() => void write(() => api.deleteBlock(b.id))}
                    />
                  ))}
                </ul>
              )}

              <div className="flex flex-wrap gap-2 border-t border-border px-5 py-4">
                {KINDS.map((k) => (
                  <button
                    key={k.kind}
                    type="button"
                    title={k.hint}
                    onClick={() =>
                      void write(() =>
                        api.addBlock(initial.id, {
                          kind: k.kind,
                          label: k.kind === "header" ? "Section" : k.kind === "email" ? "Get the newsletter" : "New row",
                          // A link and an embed are refused without one, and a
                          // placeholder is easier to replace than an error.
                          url: k.kind === "link" || k.kind === "embed" ? "https://example.com" : undefined,
                        }),
                      )
                    }
                    className="h-7 rounded-sm px-3 text-sm font-medium shadow-[inset_0_0_0_1px_var(--border)] hover:bg-sunken"
                  >
                    Add {k.label.toLowerCase()}
                  </button>
                ))}
              </div>
            </section>
          </div>

          {/* The page itself, at the width most of its visitors use. */}
          <aside className="lg:sticky lg:top-8 lg:self-start">
            <div className="card overflow-hidden">
              <header className="flex items-center justify-between px-4 py-3">
                <h2 className="text-sm font-semibold">Preview</h2>
                <span className="text-xs text-faint">{page?.published ? "Live" : "Draft"}</span>
              </header>
              <iframe
                key={rev}
                src={`/api/pages/${initial.id}/preview`}
                title="Page preview"
                className="block w-full border-0 border-t border-border bg-sunken"
                style={{ height: 620 }}
              />
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

/** A text input that saves when you leave it or press Enter, never per keystroke. */
function Field({ label, value, onCommit, mono }: { label: string; value: string; onCommit: (v: string) => void; mono?: boolean }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  return (
    <label className="block text-sm">
      <span className="text-muted">{label}</span>
      <input
        value={draft}
        onChange={(e) => setDraft(e.currentTarget.value)}
        onBlur={() => onCommit(draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setDraft(value);
        }}
        className={`mt-1 h-8 w-full rounded-sm bg-surface px-2 text-sm shadow-[inset_0_0_0_1px_var(--border)] focus-visible:outline-2 focus-visible:outline-ring ${mono ? "font-mono text-xs" : ""}`}
      />
    </label>
  );
}

function BlockRow({
  block,
  first,
  last,
  onMove,
  onPatch,
  onDelete,
}: {
  block: Block;
  first: boolean;
  last: boolean;
  onMove: (delta: number) => void;
  onPatch: (body: Partial<Pick<Block, "label" | "url" | "meta" | "active">>) => void;
  onDelete: () => void;
}) {
  const takesUrl = block.kind === "link" || block.kind === "embed";
  const takesNote = block.kind === "link";

  return (
    <li className={`border-t border-border px-5 py-4 ${block.active ? "" : "opacity-55"}`}>
      <div className="flex items-center gap-2">
        <Badge>{block.kind}</Badge>
        <span className="ml-auto flex items-center gap-1">
          <IconButton label="Move up" disabled={first} onClick={() => onMove(-1)}>↑</IconButton>
          <IconButton label="Move down" disabled={last} onClick={() => onMove(1)}>↓</IconButton>
          <button
            type="button"
            onClick={() => onPatch({ active: block.active ? 0 : 1 })}
            className="h-6 rounded-sm px-2 text-xs text-muted hover:bg-sunken"
          >
            {block.active ? "Hide" : "Show"}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="h-6 rounded-sm px-2 text-xs text-danger hover:bg-danger-tint"
          >
            Delete
          </button>
        </span>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Label" value={block.label} onCommit={(v) => v !== block.label && onPatch({ label: v })} />
        {takesUrl && (
          <Field label="URL" mono value={block.url} onCommit={(v) => v !== block.url && onPatch({ url: v })} />
        )}
        {takesNote && (
          <Field
            label="Note"
            value={readNote(block.meta)}
            onCommit={(v) => v !== readNote(block.meta) && onPatch({ meta: JSON.stringify(v ? { note: v } : {}) })}
          />
        )}
      </div>
    </li>
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
      className="h-6 w-6 rounded-sm text-sm text-muted hover:bg-sunken disabled:opacity-30"
    >
      {children}
    </button>
  );
}

/** Creating a page. One field, because everything else is editable after. */
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
