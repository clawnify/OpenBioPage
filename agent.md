# OpenBioPage

Link pages for the people this org serves. One install holds every page; an
agency runs one per client, a single person runs one.

## What you do, and what you leave to the app

- **You decide what belongs on a page.** New episode, sold-out product, a link
  that now 404s: you are the one who knows, because you see the org's work.
- **You never count clicks yourself, and never guess at them.** Every link is
  served through a counting redirect. `GET /api/pages/{id}/stats` is the only
  honest source; a number you infer from anything else is wrong.
- **You never test a link by fetching it yourself.** `POST /api/pages/{id}/check`
  walks the page and records what each link answered. Doing it by hand gives you
  a result the app cannot see, so the overview stays wrong.
- **You do not delete a row to hide it.** Set `active: 0`. Deleting throws away
  the click history that justifies the next reorder.
- **You do not publish a page.** `published` is a person's call. Build the page,
  say it is ready, and let them flip it.

## The recurring job

This is the work, and it repeats. Run it weekly per page unless told otherwise.

1. `GET /api/overview`. It is sorted stalest first and carries `broken` and
   `clicks_7d` per page. Everything below starts from a row here.
2. For any page with `broken > 0`, or one you have not checked in a week:
   `POST /api/pages/{pageId}/check`. It returns the failing rows with the status
   each one answered.
3. Report what you found before changing it. A dead link is the owner's
   decision: a 404 shop link may mean the product is gone, or that someone moved
   it. Ask, then fix.
4. `GET /api/pages/{pageId}/stats` for the click order. When the order on the
   page disagrees with the order by clicks, say so with both numbers and offer
   the swap. Do not reorder unasked: position is often a deal or a promise.
5. Apply agreed changes with `PATCH /api/blocks/{id}` or
   `POST /api/pages/{pageId}/blocks`, then reorder in one call with
   `POST /api/pages/{pageId}/blocks/order`.

## What "broken" means

`check_status` is what the link answered on the last check.

- `>= 400` from the host: the page is gone or refuses us.
- `599`: ours, for a link that did not answer at all. Timeout, DNS or TLS. It is
  often intermittent, so re-check once before telling anyone a link is dead.
- `400` with no fetch: the stored URL is not http or https, so the page refuses
  to render it. That row is invisible to visitors right now.
- `null`: never checked. Not the same as healthy, and never report it as such.

## Screens

- `/` is the overview: every page with its staleness, broken count and clicks.
  Screenshot-friendly, and the right thing to show when someone asks how the
  pages are doing.
- The public page itself is at `/p/{slug}`, or on the page's own hostname when
  one is set. It is plain HTML with no JavaScript, so it is safe to open and
  read directly when you want to see what a visitor sees.

## API anchors

Full shapes are in `/llms.txt`; these are the ones you write most.

- `POST /api/pages` — `{ title, slug?, subtitle?, hostname? }`. The footer
  credit is filled in from the install's settings, so do not pass one.
- `POST /api/pages/{pageId}/blocks` — `{ kind, label, url?, meta? }`.
  `kind` is `link`, `header`, `embed` or `email`. `link` and `embed` need a
  `url`. `meta` is JSON and today carries one field: `{ "note": "..." }`, a
  muted second line.
- `PATCH /api/pages/{id}` — `theme` is a JSON string. **Name a preset first**
  and override from there: `{"preset":"paper","accent":"#7a5c3e"}`. The presets
  are `mono`, `ink`, `paper`, `sunset`, `brutal`, `slate`, `candy`, `forest`,
  and each one is a whole look, not a palette. Overridable fields are
  `background`, `background2` (a second stop makes it a gradient), `angle`,
  `foreground`, `accent`, `font` (`sans`/`serif`/`mono`/`rounded`/`condensed`),
  `button` (`fill`/`outline`/`soft`/`shadow`), `corner`
  (`sharp`/`round`/`pill`), `avatar` (`circle`/`rounded`/`square`) and `align`.

  Two things you do not control: button text colour is computed from the accent
  so it stays readable, and a colour the app cannot parse is ignored rather than
  inlined. If a brand colour comes out looking wrong, it was refused, not lost:
  send a hex.

### The contact card and its QR

A page carries a `contact` object — `{name, org, title, email, phone, url,
address, note}` — patched onto the page like any other field. Add a `contact`
block and the page grows a button that hands the card over.

- `GET /p/{slug}/contact.vcf` — the card, as vCard 3.0. Published pages only.
  With no `name` of its own it goes out under the page title, so the route
  answers for any published page rather than 404ing on a half-filled card.
- `GET /p/{slug}/qr.svg` — a code pointing at the page, on whichever hostname
  it was asked from. A card printed from the custom domain therefore does not
  send people to the platform one.

vCard 3.0, not 4.0: 4.0 is the current standard and 3.0 is what the contact
apps on both phones import without argument.

### The socials row

A `socials` block is one row of platform marks. Its `meta` is
`{"items":[{"p":"instagram","url":"https://…"}]}`, and `p` must be one of
`instagram`, `youtube`, `x`, `facebook`, `linkedin`, `spotify`, `whatsapp`,
`email`, `website` — anything else is dropped rather than drawn.

Each mark goes through the counting redirect as `/r/{block}/{p}`, so a tap on a
social is recorded like any other click, with the platform in the click's
`target`. Removing a platform means clearing its address; there is no separate
delete.

### Adding a link

`GET /api/link-meta?url=` reads the destination's own `og:title`,
`og:description` and `og:image` and returns them, having already copied the
image into this app's bucket — so the `image` you get back is a key for `/m/`,
not somebody else's URL. Put it in the block's `meta` as
`{"note":"…","image":"<key>"}` and it renders as a 40px thumbnail on the row.

Use it instead of asking the user to retype a title that the page already
publishes. It costs a fetch, not a model call and not a screenshot: both of
those exist and neither is the right tool for four meta tags.

Blank fields mean the page publishes none. That is normal and not an error —
fall back to whatever label the person gave you.

### Putting a photograph behind a page

`POST /api/uploads` with the image as the raw body and its real `Content-Type`
(JPEG, PNG, WebP, AVIF or GIF, up to 5 MB) returns a `key`. Then set the page's
theme to `{"header":"hero","image":"<key>"}` and the photo becomes the canvas
with the name over it.

**You do not control how dark it gets.** A photograph cannot be contrast-checked
— the next upload is a white sky where the last was a dark wall — so the app
computes the scrim opacity that keeps the text above 4.5:1 against the worst
pixel the image could contain, and refuses anything lighter. `overlay` can go
darker than that and never lighter. If a client asks why their photo looks
muted, that is the reason, and the answer is a darker photo rather than a
thinner scrim.

### Writing a template

A look you will reuse belongs in a template rather than repeated on every page.

- `GET /api/templates` — the eight built-ins plus this org's own.
- `GET /api/templates/{slug}/markdown` — the template as a document: a
  frontmatter block of fields, then prose about what the look is for and which
  of its rules are load-bearing.
- `POST /api/templates` `{ markdown }` — add or replace one. The slug comes
  from the frontmatter. A built-in's slug is refused; pick another.
- `DELETE /api/templates/{slug}` — custom templates only.

The intended loop is: download the closest built-in, edit it for the client,
post it back, then set the page's theme to `{"preset":"<your-slug>"}`. Edit the
prose as well as the fields. It is what the next editor — you, next month, or a
person — reads to know why the look is the way it is, and it survives the round
trip untouched.
- `PUT /api/settings` — the default footer credit for pages created from here on.
  It does not rewrite pages that already exist.

## Cost

Nothing here calls a model or a paid API. The only outbound requests the app
makes are the link checker's, and it is bounded to 40 links per call. Run it as
often as it is useful.
