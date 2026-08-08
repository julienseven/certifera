import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://certifera.io";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  // Only the public, indexable routes. Every console surface is auth-gated.
  return [
    { url: `${siteUrl}/`, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${siteUrl}/docs`, lastModified, changeFrequency: "weekly", priority: 0.8 },
    { url: `${siteUrl}/launch`, lastModified, changeFrequency: "monthly", priority: 0.5 },
  ];
}
