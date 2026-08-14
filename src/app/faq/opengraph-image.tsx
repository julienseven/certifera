import { OG_CONTENT_TYPE, OG_SIZE, renderOgImage } from "@/lib/og-image";

export const alt = "Certifera FAQ — how verified execution works";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgImage({
    eyebrow: "FAQ",
    headline: ["Straight answers,", "unflattering ones too."],
    standfirst: "How the lifecycle works, what a proof bundle contains, what the 5% fee covers, and what is deliberately not built yet.",
    footnote: "lifecycle  ·  economics  ·  access  ·  honest status",
  });
}
