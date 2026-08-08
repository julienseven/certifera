import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://certifera.io";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Belt and braces with the per-route `robots: { index: false }` metadata
        // in each private route group's layout.
        disallow: ["/api/", "/access", "/console", "/pilot", "/cohorts", "/operations", "/insights"],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
