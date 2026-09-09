/**
 * Base64 data-URI for the helmet mark, for the two rendering contexts that
 * can't reference a `/public` file by URL: `apple-icon.tsx` and the splash
 * route both run through Satori (`next/og`'s `ImageResponse`), which needs
 * an `<img src>` it can decode standalone — a relative path isn't resolvable
 * there. Read once per process and cached, not per request.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

let cached: string | null = null;

export function helmetDataUri(): string {
  if (!cached) {
    const buf = readFileSync(join(process.cwd(), "public/brand/helmet-512.png"));
    cached = `data:image/png;base64,${buf.toString("base64")}`;
  }
  return cached;
}
