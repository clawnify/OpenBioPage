// A page as a contact card.
//
// vCard 3.0 rather than 4.0: 4.0 is the current standard and 3.0 is what the
// contact apps on both phones actually import without argument. A card that
// validates and does not open is worth nothing at a conference.
//
// RFC 2426 for the grammar, RFC 5322 folding for the line length.

export interface Contact {
  /** Display name. The one field a card cannot do without. */
  name?: string;
  first?: string;
  last?: string;
  org?: string;
  title?: string;
  email?: string;
  phone?: string;
  url?: string;
  address?: string;
  note?: string;
}

/**
 * Escape a text value. Backslash first, or it re-escapes what came after.
 * Newlines become a literal \n inside the value rather than ending the line.
 */
function esc(v: string): string {
  return v
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Fold to 75 octets, continuing with a leading space.
 *
 * The limit is bytes, not characters, and folding mid-character corrupts the
 * value — so this measures UTF-8 length and never splits a code point.
 */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;

  const out: string[] = [];
  let current = "";
  let width = 0;
  // The continuation line carries a leading space, so it has one octet less.
  for (const ch of line) {
    const size = new TextEncoder().encode(ch).length;
    const limit = out.length === 0 ? 75 : 74;
    if (width + size > limit) {
      out.push(current);
      current = "";
      width = 0;
    }
    current += ch;
    width += size;
  }
  if (current) out.push(current);
  return out.join("\r\n ");
}

/** Build the card. Returns null when there is nothing worth saving. */
export function vcard(c: Contact): string | null {
  const name = (c.name ?? "").trim();
  if (!name) return null;

  // N is structured: last;first;middle;prefix;suffix. When the parts were not
  // given separately, put the whole name in the family slot rather than
  // guessing where a name divides — plenty of names do not split that way.
  const last = (c.last ?? "").trim();
  const first = (c.first ?? "").trim();
  const structured = last || first ? `${esc(last)};${esc(first)};;;` : `${esc(name)};;;;`;

  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${structured}`,
    `FN:${esc(name)}`,
  ];

  const add = (key: string, value: string | undefined) => {
    const v = (value ?? "").trim();
    if (v) lines.push(`${key}:${esc(v)}`);
  };

  add("ORG", c.org);
  add("TITLE", c.title);
  if (c.email?.trim()) lines.push(`EMAIL;TYPE=INTERNET,WORK:${esc(c.email.trim())}`);
  if (c.phone?.trim()) lines.push(`TEL;TYPE=CELL,VOICE:${esc(c.phone.trim())}`);
  // URL is a URI, not a text value: escaping its commas would break the link.
  if (c.url?.trim()) lines.push(`URL:${c.url.trim().replace(/[\r\n]/g, "")}`);
  // ADR is structured too: pobox;ext;street;locality;region;postcode;country.
  if (c.address?.trim()) lines.push(`ADR;TYPE=WORK:;;${esc(c.address.trim())};;;;`);
  add("NOTE", c.note);

  lines.push("END:VCARD");
  // CRLF is required, not stylistic: some importers reject bare newlines.
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** Read a page's stored contact, tolerating a column that was never written. */
export function readContact(raw: string): Contact {
  try {
    const c = JSON.parse(raw || "{}") as Contact;
    return c && typeof c === "object" ? c : {};
  } catch {
    return {};
  }
}
