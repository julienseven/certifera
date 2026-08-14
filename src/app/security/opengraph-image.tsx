import { OG_CONTENT_TYPE, OG_SIZE, renderOgImage } from "@/lib/og-image";

export const alt = "Certifera security — evidence integrity, and what we don't claim";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgImage({
    eyebrow: "Security",
    headline: ["Trust is a claim.", "Here is the mechanism."],
    standfirst: "Scrypt, AES-256-GCM, constant-time key comparison, SHA-256 private evidence, and an append-only ledger. Plus what does not exist yet.",
    footnote: "implemented controls  ·  and the absence list",
  });
}
