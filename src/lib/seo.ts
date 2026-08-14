import type { Metadata } from "next";

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://certifera.io";
export const SITE_NAME = "Certifera";
export const X_HANDLE = "@certiferaxyz";

/** Canonical public routes. Single source of truth for the sitemap and footer. */
export const PUBLIC_ROUTES = [
  { path: "/", label: "Overview", priority: 1, changeFrequency: "weekly" as const },
  { path: "/docs", label: "Docs", priority: 0.9, changeFrequency: "weekly" as const },
  { path: "/for/agent-builders", label: "For agent builders", priority: 0.8, changeFrequency: "monthly" as const },
  { path: "/for/relays", label: "For relays", priority: 0.8, changeFrequency: "monthly" as const },
  { path: "/security", label: "Security", priority: 0.7, changeFrequency: "monthly" as const },
  { path: "/faq", label: "FAQ", priority: 0.7, changeFrequency: "monthly" as const },
  { path: "/glossary", label: "Glossary", priority: 0.6, changeFrequency: "monthly" as const },
  { path: "/launch", label: "Launch readiness", priority: 0.5, changeFrequency: "monthly" as const },
] as const;

type PageSeo = {
  title: string;
  description: string;
  path: string;
  /** Long-tail terms for this page only; the site-wide set lives in the root layout. */
  keywords?: string[];
  type?: "website" | "article";
  /** Bypass the root layout's `%s | Certifera` template, for titles that already carry the brand. */
  absoluteTitle?: boolean;
};

/**
 * Builds page metadata with a self-referencing canonical. Omitting `alternates`
 * lets Next inherit the parent's canonical, which silently duplicates `/` across
 * every child route — the single most common cause of a "duplicate, Google chose
 * a different canonical" report in Search Console.
 */
export function pageMetadata({ title, description, path, keywords, type = "website", absoluteTitle }: PageSeo): Metadata {
  const url = path === "/" ? "/" : path;
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    ...(keywords?.length ? { keywords } : {}),
    alternates: { canonical: url },
    openGraph: { type, url, siteName: SITE_NAME, title, description, locale: "en_US" },
    twitter: { card: "summary_large_image", title, description, creator: X_HANDLE },
  };
}

export function absoluteUrl(path: string) {
  return new URL(path, SITE_URL).toString();
}

/** Renders a JSON-LD payload. Callers embed the return value in a <script type="application/ld+json">. */
export function jsonLd(payload: Record<string, unknown> | Record<string, unknown>[]) {
  const graph = Array.isArray(payload) ? { "@context": "https://schema.org", "@graph": payload } : { "@context": "https://schema.org", ...payload };
  // U+003C escape stops a `</script>` inside any string value from closing the tag early.
  return JSON.stringify(graph).replace(/</g, "\\u003c");
}

export function organizationSchema() {
  return {
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: SITE_NAME,
    url: SITE_URL,
    logo: absoluteUrl("/icon"),
    description: "Certifera is verified-execution infrastructure: agents fund a real-world outcome, vetted relays execute it, and payout releases only after reviewed proof.",
    sameAs: ["https://x.com/certiferaxyz", "https://github.com/julienseven/certifera"],
  };
}

export function websiteSchema() {
  return {
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    url: SITE_URL,
    name: SITE_NAME,
    publisher: { "@id": `${SITE_URL}/#organization` },
    inLanguage: "en-US",
  };
}

export function breadcrumbSchema(trail: { name: string; path: string }[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: trail.map((entry, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: entry.name,
      item: absoluteUrl(entry.path),
    })),
  };
}

export function faqSchema(entries: readonly (readonly [string, string])[]) {
  return {
    "@type": "FAQPage",
    mainEntity: entries.map(([question, answer]) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer },
    })),
  };
}

export function definedTermSetSchema(name: string, path: string, terms: readonly (readonly [string, string])[]) {
  const setId = `${absoluteUrl(path)}#termset`;
  return {
    "@type": "DefinedTermSet",
    "@id": setId,
    name,
    url: absoluteUrl(path),
    hasDefinedTerm: terms.map(([term, description]) => ({
      "@type": "DefinedTerm",
      name: term,
      description,
      inDefinedTermSet: { "@id": setId },
    })),
  };
}
