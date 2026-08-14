import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

type OgTemplate = {
  eyebrow: string;
  /** Rendered as stacked lines; the last one is tinted mint. Keep to two lines. */
  headline: readonly string[];
  standfirst: string;
  /** Bottom-left rail. Use ASCII only — the bundled face has no guaranteed U+2192. */
  footnote: string;
};

/**
 * Shared Open Graph card. Rendered by Satori: flexbox only, no grid, and every
 * multi-child node needs an explicit `display: flex`. Only the bundled Geist
 * Regular (weight 400) is available, so hierarchy comes from size and color
 * rather than font weight.
 */
export function renderOgImage({ eyebrow, headline, standfirst, footnote }: OgTemplate) {
  // 104px fits ~15 characters per line at this width; step down for longer headlines
  // so a two-line title never collides with the standfirst below it.
  const longest = Math.max(...headline.map((line) => line.length));
  const headlineSize = longest > 26 ? 74 : longest > 20 ? 88 : 104;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          position: "relative",
          background: "#060806",
          color: "#f4f7f2",
          padding: 64,
        }}
      >
        <div style={{ position: "absolute", top: 0, left: 0, width: 1200, height: 8, background: "#73f59a" }} />
        <div
          style={{
            position: "absolute",
            top: -220,
            right: -160,
            width: 720,
            height: 720,
            borderRadius: 720,
            backgroundImage: "radial-gradient(circle, rgba(115,245,154,0.22), rgba(6,8,6,0) 70%)",
          }}
        />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div style={{ width: 36, height: 36, borderRadius: 36, background: "#73f59a", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: 13, height: 13, background: "#071b0e", transform: "rotate(45deg)" }} />
            </div>
            <div style={{ fontSize: 34, letterSpacing: -1.4 }}>certifera/</div>
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 18,
              letterSpacing: 2.4,
              textTransform: "uppercase",
              color: "#73f59a",
              border: "1px solid rgba(115,245,154,0.45)",
              borderRadius: 999,
              padding: "9px 20px",
            }}
          >
            {eyebrow}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          <div style={{ display: "flex", flexDirection: "column", fontSize: headlineSize, lineHeight: 1, letterSpacing: -5 }}>
            {headline.map((line, index) => (
              <div key={line} style={{ display: "flex", color: index === headline.length - 1 ? "#73f59a" : "#f4f7f2" }}>
                {line}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", fontSize: 27, lineHeight: 1.35, maxWidth: 900, color: "rgba(244,247,242,0.62)" }}>{standfirst}</div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "1px solid rgba(255,255,255,0.14)",
            paddingTop: 26,
            fontSize: 21,
          }}
        >
          <div style={{ display: "flex", color: "rgba(244,247,242,0.5)" }}>{footnote}</div>
          <div style={{ display: "flex", color: "#73f59a" }}>certifera.xyz</div>
        </div>
      </div>
    ),
    { ...OG_SIZE },
  );
}
