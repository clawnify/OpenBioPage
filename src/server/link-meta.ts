// What a URL says about itself.
//
// A link row wants a title, a description and an image, and a page already
// publishes all three in its head. So this fetches the document and reads four
// meta tags. No model and no browser: `/screenshot/render` is a browser launch
// against a monthly org quota, and spending one to learn a page's title would
// be paying rendering prices for parsing work.
//
// Only the head is read. A fetch is streamed and abandoned once `</head>` goes
// past, so a 40 MB page costs the same as a small one.

/** How much of the document to read before giving up on finding a head. */
const HEAD_BUDGET = 128 * 1024;
const TIMEOUT_MS = 6000;

export interface LinkMeta {
  title: string;
  description: string;
  image: string;
}

const decode = (s: string): string =>
  s
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === "#") return String.fromCodePoint(Number(e[1] === "x" || e[1] === "X" ? `0${e.slice(1)}` : e.slice(1)));
      return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " }[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, " ")
    .trim();

/** The content of the first meta tag whose name/property matches. */
function meta(head: string, keys: string[]): string {
  for (const key of keys) {
    // Attribute order is not fixed in the wild, so match either arrangement
    // rather than assuming content comes last.
    const patterns = [
      new RegExp(`<meta[^>]+(?:property|name)\\s*=\\s*["']${key}["'][^>]*?content\\s*=\\s*["']([^"']*)["']`, "i"),
      new RegExp(`<meta[^>]+content\\s*=\\s*["']([^"']*)["'][^>]*?(?:property|name)\\s*=\\s*["']${key}["']`, "i"),
    ];
    for (const re of patterns) {
      const m = re.exec(head);
      if (m?.[1]?.trim()) return decode(m[1]);
    }
  }
  return "";
}

/**
 * Read a page's own description of itself.
 *
 * Returns blanks rather than throwing: a link whose metadata cannot be read is
 * still a link someone wants on their page, and the editor should fall back to
 * letting them type a label rather than refusing the URL.
 */
export async function readLinkMeta(raw: string): Promise<LinkMeta> {
  const empty = { title: "", description: "", image: "" };

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return empty;
  }
  // Same rule the page renderer applies to a link before it will emit it.
  if (url.protocol !== "https:" && url.protocol !== "http:") return empty;

  const stop = AbortSignal.timeout(TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      signal: stop,
      redirect: "follow",
      headers: {
        // Some sites serve a different head to a bare client; asking for HTML
        // and naming ourselves gets the document a browser would get.
        accept: "text/html,application/xhtml+xml",
        "user-agent": "Mozilla/5.0 (compatible; OpenBioPage link preview)",
      },
    });
  } catch {
    return empty;
  }

  if (!res.ok || !res.body) return empty;
  if (!/text\/html|application\/xhtml/i.test(res.headers.get("content-type") ?? "")) return empty;

  // Read only as far as the head, then drop the connection.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let head = "";
  try {
    while (head.length < HEAD_BUDGET) {
      const { done, value } = await reader.read();
      if (done) break;
      head += decoder.decode(value, { stream: true });
      if (/<\/head>/i.test(head)) break;
    }
  } catch {
    // Whatever arrived before the failure is still worth parsing.
  } finally {
    void reader.cancel().catch(() => {});
  }

  const title =
    meta(head, ["og:title", "twitter:title"]) || decode(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1] ?? "");
  const image = meta(head, ["og:image", "og:image:url", "twitter:image", "twitter:image:src"]);

  return {
    title: title.slice(0, 120),
    description: meta(head, ["og:description", "twitter:description", "description"]).slice(0, 200),
    // Resolve against the page, since plenty of sites publish a relative path.
    image: image ? (URL.parse?.(image, res.url)?.href ?? new URL(image, res.url).href).slice(0, 2000) : "",
  };
}


/** What a browser will render, and what we are willing to store. */
const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
};

/** A thumbnail is small; anything larger is a page asset that wandered in. */
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

/**
 * Copy a remote image into this app's bucket and return its key.
 *
 * Returns "" on any failure, because a missing thumbnail is a cosmetic loss and
 * refusing the link over it would not be.
 */
export async function mirrorImage(bucket: R2Bucket, org: string, remote: string): Promise<string> {
  let url: URL;
  try {
    url = new URL(remote);
  } catch {
    return "";
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return "";

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "follow" });
    if (!res.ok) return "";

    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    const ext = IMAGE_TYPES[type];
    if (!ext) return "";

    // Trust the declared length when it is there, and still measure what
    // arrived: a wrong or absent header is exactly how a cap gets bypassed.
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > MAX_IMAGE_BYTES) return "";

    const body = await res.arrayBuffer();
    if (body.byteLength === 0 || body.byteLength > MAX_IMAGE_BYTES) return "";

    const key = `${org}/link/${crypto.randomUUID()}.${ext}`;
    await bucket.put(key, body, { httpMetadata: { contentType: type } });
    return key;
  } catch {
    return "";
  }
}
