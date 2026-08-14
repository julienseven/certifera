import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

/** Auth-gated surfaces. Kept in one place so robots.ts and the sitemap cannot drift. */
const PRIVATE_PATHS = ["/api/", "/access", "/console", "/pilot", "/cohorts", "/operations", "/insights"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Belt and braces with the per-route `robots: { index: false }` metadata
        // in each private route group's layout.
        disallow: PRIVATE_PATHS,
      },
      // Answer engines are allowed the same public surface as search crawlers:
      // the content pages are written to be quoted, and blocking them only
      // removes attribution, not the summarisation.
      { userAgent: ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended"], allow: "/", disallow: PRIVATE_PATHS },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
