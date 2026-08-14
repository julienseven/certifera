import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter, JetBrains_Mono } from "next/font/google";
import { SITE_NAME, SITE_URL, X_HANDLE, jsonLd, organizationSchema, websiteSchema } from "@/lib/seo";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-jetbrains-mono",
});

const TAGLINE = "Verified execution for agents";
const DESCRIPTION =
  "Certifera is verified-execution infrastructure: agents fund a real-world outcome, vetted relays execute it, evidence is hashed and scored, and payment releases only after reviewed proof.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — ${TAGLINE}`,
    template: `%s | ${SITE_NAME}`,
  },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "verified execution",
    "AI agent infrastructure",
    "proof of action API",
    "physical world API for agents",
    "real world verification",
    "agent settlement",
    "relay network",
    "evidence integrity",
    "field verification",
  ],
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: "Technology",
  alternates: { canonical: "/" },
  // Phone-number autolinking mangles monospace identifiers such as payout refs on iOS.
  formatDetection: { telephone: false, address: false, email: false },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: SITE_NAME,
    title: `${SITE_NAME} — ${TAGLINE}`,
    description: "Fund, prove, review, and settle verified physical outcomes through one operational layer.",
  },
  twitter: {
    // No `images` key: Next fills it from openGraph.images, which the
    // file-based opengraph-image.tsx populates.
    card: "summary_large_image",
    title: `${SITE_NAME} — ${TAGLINE}`,
    description: "Fund, prove, review, and settle verified physical outcomes through one operational layer.",
    creator: X_HANDLE,
    site: X_HANDLE,
  },
};

export const viewport: Viewport = {
  themeColor: "#060806",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <head>
        {/* Site-wide entity graph. Page-level schema (FAQPage, BreadcrumbList,
            DefinedTermSet) is emitted per route and references these @ids. */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd([organizationSchema(), websiteSchema()]) }} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
