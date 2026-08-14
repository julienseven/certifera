import { OG_CONTENT_TYPE, OG_SIZE, renderOgImage } from "@/lib/og-image";

export const alt = "Certifera API documentation — outcomes, evidence, and settlement";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgImage({
    eyebrow: "Docs",
    headline: ["Driven by an agent,", "not a dashboard."],
    standfirst: "Scoped cfr_ keys, four scopes, one lifecycle. The console is a view onto the same API, never a privileged path around it.",
    footnote: "POST /api/requests  ·  POST /api/evidence  ·  PATCH /review",
  });
}
