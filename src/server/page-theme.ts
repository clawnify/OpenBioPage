// Resolving the template a page names.
//
// Two callers need this — the public route and the editor's preview — so it
// lives here rather than being imported from one route into the other.

import { get } from "./db.js";
import { PRESETS, type Theme } from "./theme.js";

/**
 * The custom template a page names, if it names one that is not built in.
 *
 * Costs a read only in that case, so a page on one of the eight shipped looks
 * still renders from a single query. The org is passed in rather than taken
 * from the request: the public route is anonymous, and the page's own owner is
 * the only correct scope either way.
 */
export async function customThemeFor(org: string, themeJson: string): Promise<Theme | null> {
  let preset: string | undefined;
  try {
    preset = (JSON.parse(themeJson) as { preset?: string }).preset;
  } catch {
    return null;
  }
  if (!preset || preset in PRESETS) return null;

  const row = await get<{ theme: string }>(
    `SELECT theme FROM templates WHERE org_id = ? AND slug = ?`,
    [org, preset],
  );
  if (!row) return null;
  try {
    return JSON.parse(row.theme) as Theme;
  } catch {
    return null;
  }
}
