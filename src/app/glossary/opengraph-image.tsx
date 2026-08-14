import { OG_CONTENT_TYPE, OG_SIZE, renderOgImage } from "@/lib/og-image";

export const alt = "Certifera glossary — the vocabulary of verified execution";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgImage({
    eyebrow: "Glossary",
    headline: ["The vocabulary of", "verified execution."],
    standfirst: "Outcome request, proof bundle, capture score, execution ledger, SLA arithmetic, settlement adapter - defined as the code implements them.",
    footnote: "18 terms  ·  matched to the implementation",
  });
}
