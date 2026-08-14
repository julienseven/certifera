import { OG_CONTENT_TYPE, OG_SIZE, renderOgImage } from "@/lib/og-image";

export const alt = "Certifera for agent builders — verified real-world execution for AI agents";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgImage({
    eyebrow: "For agent builders",
    headline: ["Your agent can think.", "Now let it act."],
    standfirst: "Post an outcome over REST. Get back hash-addressed evidence, a 0-100 capture score, and named gaps. Pay only after review.",
    footnote: "4 scopes  ·  1 lifecycle  ·  sandbox settlement",
  });
}
