// The parser reads other people's HTML, which is where the surprises live:
// attributes in either order, single quotes, entities, relative image paths.

import { describe, expect, it, vi, afterEach } from "vitest";
import { readLinkMeta } from "./link-meta.js";

/** A fetch that answers once with this document. */
function serve(html: string, init: { type?: string; status?: number; url?: string } = {}) {
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new TextEncoder().encode(html));
      c.close();
    },
  });
  const res = new Response(body, {
    status: init.status ?? 200,
    headers: { "content-type": init.type ?? "text/html; charset=utf-8" },
  });
  if (init.url) Object.defineProperty(res, "url", { value: init.url });
  vi.stubGlobal("fetch", vi.fn(async () => res));
}

afterEach(() => vi.unstubAllGlobals());

describe("reading a page's own description of itself", () => {
  it("prefers open graph over the title tag", async () => {
    serve(`<html><head><title>Fallback</title>
      <meta property="og:title" content="The real one">
      <meta property="og:description" content="What it is">
      </head><body>`);
    const m = await readLinkMeta("https://example.com");
    expect(m.title).toBe("The real one");
    expect(m.description).toBe("What it is");
  });

  it("falls back to the title tag when there is no open graph", async () => {
    serve(`<html><head><title>  Just   a title </title></head>`);
    expect((await readLinkMeta("https://example.com")).title).toBe("Just a title");
  });

  it("reads a meta tag with the attributes in the other order", async () => {
    serve(`<head><meta content="Backwards" property="og:title"></head>`);
    expect((await readLinkMeta("https://example.com")).title).toBe("Backwards");
  });

  it("handles single quotes and entities", async () => {
    serve(`<head><meta property='og:title' content='Ben &amp; Jerry&#39;s'></head>`);
    expect((await readLinkMeta("https://example.com")).title).toBe("Ben & Jerry's");
  });

  it("resolves a relative image against the page it came from", async () => {
    serve(`<head><meta property="og:image" content="/img/card.png"></head>`, {
      url: "https://shop.example.com/products/mug",
    });
    expect((await readLinkMeta("https://shop.example.com/products/mug")).image).toBe(
      "https://shop.example.com/img/card.png",
    );
  });

  it("takes twitter tags when open graph is absent", async () => {
    serve(`<head><meta name="twitter:title" content="From twitter"></head>`);
    expect((await readLinkMeta("https://example.com")).title).toBe("From twitter");
  });

  it("returns blanks rather than throwing on a url that is not one", async () => {
    expect(await readLinkMeta("not a url")).toEqual({ title: "", description: "", image: "" });
  });

  it("refuses a non-http scheme", async () => {
    expect(await readLinkMeta("javascript:alert(1)")).toEqual({ title: "", description: "", image: "" });
  });

  it("ignores a response that is not html", async () => {
    serve(`<head><meta property="og:title" content="x"></head>`, { type: "application/pdf" });
    expect((await readLinkMeta("https://example.com")).title).toBe("");
  });

  it("ignores an error response", async () => {
    serve(`<head><title>Not found</title></head>`, { status: 404 });
    expect((await readLinkMeta("https://example.com")).title).toBe("");
  });

  it("survives a fetch that throws", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network"); }));
    expect(await readLinkMeta("https://example.com")).toEqual({ title: "", description: "", image: "" });
  });

  it("caps what it returns, so one row cannot carry a novel", async () => {
    serve(`<head><meta property="og:title" content="${"a".repeat(500)}">
      <meta property="og:description" content="${"b".repeat(500)}"></head>`);
    const m = await readLinkMeta("https://example.com");
    expect(m.title).toHaveLength(120);
    expect(m.description).toHaveLength(200);
  });
});
