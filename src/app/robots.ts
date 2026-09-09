import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/seo";

/**
 * `/tracker` and `/parlay` are per-user working surfaces (a bet slip, a
 * personal ledger) with no content of their own to index — every visitor
 * sees different data behind the same URL, which is exactly what a search
 * index should not crawl.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/tracker", "/parlay"],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
