import { OG_CONTENT_TYPE, OG_SIZE, renderOgImage } from "@/lib/og-image";

export const alt = "Certifera for field relays — get paid to verify real-world outcomes";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgImage({
    eyebrow: "For field relays",
    headline: ["You're already nearby.", "Get paid to prove it."],
    standfirst: "Bid your own price on work in your coverage zone. Flat 5% protocol fee, reputation on a ledger you can read.",
    footnote: "you keep 95%  ·  6h review window  ·  +8 / -12 reputation",
  });
}
