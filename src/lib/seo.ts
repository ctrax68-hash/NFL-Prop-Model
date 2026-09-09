/**
 * Shared helpers for the public SEO surface (player/game pages, sitemap,
 * metadata) — kept in one place so a slug built on one page always matches
 * the slug the sitemap linked to it with.
 */

/** No default in production — an email or a sitemap entry needs a real absolute URL to be worth anything. Falls back to localhost only so local dev/build doesn't crash without it configured. */
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
}

function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents (é -> e)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** nflverse's gsis_id, e.g. "00-0033873" — fixed shape, safe to anchor a regex on. */
const PLAYER_ID_PATTERN = /\d{2}-\d{7}/;

/** `"Patrick Mahomes"` + `"00-0033873"` -> `"patrick-mahomes-00-0033873"`. */
export function playerSlug(name: string, playerId: string): string {
  return `${slugifyName(name)}-${playerId}`;
}

/**
 * Recovers the player id from a slug without needing a lookup — the id's
 * own fixed `\d{2}-\d{7}` shape is unambiguous even though the slugified
 * name in front of it also contains hyphens.
 */
export function playerIdFromSlug(slug: string): string | null {
  const match = new RegExp(`(${PLAYER_ID_PATTERN.source})$`).exec(slug);
  return match ? match[1] : null;
}

/**
 * A game's own id (`"2025_18_NYJ_BUF"`) is already URL-safe and human
 * readable, so the "slug" is just the id itself — no separate encoding to
 * keep in sync between the sitemap and the page.
 */
export function gameSlug(gameId: string): string {
  return gameId;
}
