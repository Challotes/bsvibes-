import type { MetadataRoute } from "next";

/**
 * Dynamic robots.txt.
 *
 * Indexing is OFF by default (early-access / quiet launch) so a rough
 * opencook.fun can't be crawled/indexed. Going public = set ALLOW_INDEXING=true
 * (one env var, no code change — see LAUNCH_CHECKLIST Stage 4). Mirrors the
 * `robots` meta tag in layout.tsx; keep the two in sync.
 */
export default function robots(): MetadataRoute.Robots {
  const allowIndexing = process.env.ALLOW_INDEXING === "true";
  return allowIndexing
    ? { rules: { userAgent: "*", allow: "/", disallow: "/api/" } }
    : { rules: { userAgent: "*", disallow: "/" } };
}
