# OpenPerch

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
- **Your brand, per page, as tokens.** Colour, corner radius and alignment come
  from the page's own theme, so a client's brand is never a hardcoded value in a
  component.

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
