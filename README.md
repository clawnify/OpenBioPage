# OpenBioPage

Link-in-bio pages you own.

One install holds every page you run: an agency puts one page per client, each
on that client's own domain, signed in the footer with the agency's name. A
single person runs one page and ignores the rest.

The difference from a hosted link page is not the page. It is what happens
around it:

- **The click history is a table in your database.** Every link is served
  through a counting redirect, so the record is yours, it survives any vendor,
  and you can query it.
- **The pages tell you when they rot.** A link checker walks each page and
  records what every link answered, and the overview sorts stalest first. Dead
  Discord invites and 404'd shop links stop being something you find out about
  from a client.
- **No JavaScript on the public page.** One self-contained HTML document, no web
  font, no external stylesheet, no beacon. It renders on the first paint in an
  in-app browser on a bad connection, which is where link pages are actually
  opened.
- **Eight presets, then your brand on top.** `mono`, `ink`, `paper`, `sunset`,
  `brutal`, `slate`, `candy`, `forest`: each one is a whole look, with its own
  typeface, button style, corner and canvas. A page names one and overrides what
  it wants. None of them costs a network request, because the type is a system
  stack and the gradients are CSS.
- **A person can build the page.** Create it, add rows, retitle them, reorder,
  hide one without losing its click history, pick a template, publish. The real
  page sits beside the editor and updates on every save, so the confirmation
  that a change worked is the change itself.
- **A template is a document, not a dropdown.** Every look downloads as
  markdown: the fields in a frontmatter block, then prose saying what it is for
  and which rules matter. Edit it yourself or hand it to an agent, paste it
  back, and it is a template your pages can wear. The prose survives the round
  trip, so the reasoning outlives the person who had it.
- **Paste a URL and the row fills itself in.** The destination's own title and
  image come back from its meta tags — a fetch, not a model call. The image is
  copied into this app's bucket, so a page with ten thumbnails still makes zero
  requests to anyone else and still tells nobody who is reading it.
- **A photograph can be the page.** Upload one and the header becomes a hero:
  the image full-bleed, the name over it. The app computes how much to darken it
  and will not go lighter, because a photo cannot be contrast-checked and the
  page has to stay readable on the *next* one someone uploads.
- **Contrast is not left to taste.** Button text colour is computed from the
  accent, and every preset is tested against WCAG AA for body text, subtitle and
  button label. The first `sunset` looked lovely and measured 2.32:1; the test
  is why it is not shipping.

## What is here

| Path | What it is |
|---|---|
| `/` | The overview: every page with its staleness, broken links and clicks |
| `/p/{slug}` | The public page. Plain HTML, server rendered |
| `/r/{block}` | The counting redirect every link goes through |
| `/api/...` | The full API, documented at `/api/openapi.json` and `/llms.txt` |

## Local development

```bash
pnpm install
pnpm dev
```

`pnpm dev` applies `schema.sql` to a local D1 and runs the UI and the Worker
together. Off the platform there is no organisation on the request, so the
authenticated routes answer 403; the public page and the redirect work.

## Blocks

A page is a list of blocks, and `kind` decides how each one renders.

| kind | Renders as |
|---|---|
| `link` | A button. The only kind whose clicks are counted |
| `header` | A quiet caption that groups the rows under it |
| `embed` | An inline player. YouTube and Spotify today |
| `email` | A signup field that posts to this app |

## Licence

MIT.
