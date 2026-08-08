import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://certifera.io";

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

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Certifera — Verified execution for agents",
    template: "%s | Certifera",
  },
  description: "Certifera is the operations layer for funding, proving, reviewing, and settling verified physical outcomes.",
  applicationName: "Certifera",
  keywords: ["AI agents", "verified outcomes", "physical world API", "proof of action", "field operations", "relay network", "agent infrastructure"],
  authors: [{ name: "Certifera" }],
  creator: "Certifera",
  publisher: "Certifera",
  category: "Technology",
  alternates: { canonical: "/" },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: "Certifera",
    title: "Certifera — Verified execution for agents",
    description: "Fund, prove, review, and settle verified physical outcomes through one operational layer.",
  },
  twitter: {
    // No `images` key: Next fills it from openGraph.images, which the
    // file-based opengraph-image.tsx populates.
    card: "summary_large_image",
    title: "Certifera — Verified execution for agents",
    description: "Fund, prove, review, and settle verified physical outcomes through one operational layer.",
    creator: "@certifera",
  },
};

export const viewport: Viewport = {
  themeColor: "#060806",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
