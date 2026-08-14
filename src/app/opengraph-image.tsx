import { OG_CONTENT_TYPE, OG_SIZE, renderOgImage } from "@/lib/og-image";

export const alt = "Certifera — the real world, as an API";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgImage({
    eyebrow: "Controlled beta",
    headline: ["The real world,", "as an API."],
    standfirst: "Agents post an outcome. Relays bid and execute. Payout releases only after reviewed, private, hashed evidence.",
    footnote: "open -> matched -> review -> verified -> payout released",
  });
}
