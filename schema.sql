-- OpenBioPage schema.
--
-- One install holds many pages. An agency runs a page per client; a single
-- person runs one. Nothing here knows about an agency: a page is a page, and
-- `org_id` is the only tenant key, injected by the platform on every request.
--
-- DDL only. A seed INSERT here fails the whole first deploy.

CREATE TABLE pages (
  id            TEXT PRIMARY KEY,
  org_id        TEXT NOT NULL,
  -- The path segment the page is served on: /p/<slug>.
  slug          TEXT NOT NULL,
  title         TEXT NOT NULL,
  subtitle      TEXT NOT NULL DEFAULT '',
  -- Custom hostname this page answers on, once its certificate is live.
  -- Used for the canonical URL and the share links the app hands out.
  hostname      TEXT,
  -- R2 key of the avatar shown at the top of the page.
  avatar_key    TEXT,
  -- Per-page brand: JSON of { accent, background, foreground, font, corner }.
  -- The public page reads these as CSS custom properties, so a client's brand
  -- never becomes a hardcoded value in a component.
  theme         TEXT NOT NULL DEFAULT '{}',
  -- Whose name signs the footer. Blank inherits the install default.
  footer_name   TEXT NOT NULL DEFAULT '',
  footer_url    TEXT NOT NULL DEFAULT '',
  published     INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE UNIQUE INDEX pages_org_slug ON pages (org_id, slug);
CREATE UNIQUE INDEX pages_hostname ON pages (hostname);

-- A block is one row on the page. `kind` decides how it renders and which of
-- the columns below carry meaning:
--   link    url + label
--   header  label only, a divider with a caption
--   embed   url, rendered as a player
--   email   label, renders the capture form
CREATE TABLE blocks (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL,
  page_id     TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  label       TEXT NOT NULL,
  url         TEXT NOT NULL DEFAULT '',
  -- Free-form per-kind extras as JSON: { icon, note, starts_at, ends_at }.
  meta        TEXT NOT NULL DEFAULT '{}',
  position    INTEGER NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1,
  -- Set by the link checker. NULL means never checked.
  checked_at  TEXT,
  check_status INTEGER,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE INDEX blocks_page ON blocks (page_id, position);

-- The reason this app exists. One row per outbound click, written by the
-- redirect at /r/:id before the visitor is forwarded. It is the agency's own
-- record: nothing about it is rented, and it survives any vendor.
CREATE TABLE clicks (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL,
  page_id     TEXT NOT NULL,
  block_id    TEXT NOT NULL,
  ts          TEXT NOT NULL,
  -- Coarse and deliberately non-identifying: no IP, no user agent string,
  -- no cookie. A referrer host and a country are enough to act on.
  referrer    TEXT NOT NULL DEFAULT '',
  country     TEXT NOT NULL DEFAULT ''
);

CREATE INDEX clicks_page_ts ON clicks (page_id, ts);
CREATE INDEX clicks_block ON clicks (block_id);

CREATE TABLE subscribers (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL,
  page_id     TEXT NOT NULL,
  email       TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE UNIQUE INDEX subscribers_page_email ON subscribers (page_id, email);

-- Install-wide defaults. One row per org.
CREATE TABLE settings (
  org_id       TEXT PRIMARY KEY,
  footer_name  TEXT NOT NULL DEFAULT '',
  footer_url   TEXT NOT NULL DEFAULT '',
  logo_key     TEXT,
  updated_at   TEXT NOT NULL
);

-- A custom template: a look someone wrote, or had an AI write, as markdown.
--
-- The built-in templates are code, not rows — they ship with the app and every
-- install has the same eight. This table holds only what an org added. A page
-- names one the same way it names a built-in, through `theme.preset`.
--
-- `body_md` is the whole document as uploaded, prose included. It is the thing
-- handed back on download, so an editor's notes survive a round trip even
-- though the renderer only reads the fields parsed out of it.
CREATE TABLE templates (
  slug       TEXT NOT NULL,
  org_id     TEXT NOT NULL,
  name       TEXT NOT NULL,
  tagline    TEXT NOT NULL DEFAULT '',
  -- JSON of the theme fields parsed out of the markdown frontmatter.
  theme      TEXT NOT NULL DEFAULT '{}',
  body_md    TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (org_id, slug)
);
