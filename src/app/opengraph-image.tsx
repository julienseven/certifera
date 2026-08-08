import { ImageResponse } from "next/og";

export const alt = "Certifera — the real world, as an API";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Rendered by Satori: flexbox only, no grid, and every multi-child node needs an
 * explicit `display: flex`. Only the bundled Geist Regular (weight 400) is
 * available, so hierarchy comes from size and color rather than font weight.
 * Arrows are ASCII on purpose — U+2192 is not guaranteed in the bundled face.
 */
export default function OpengraphImage() {
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

        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 36,
              background: "#73f59a",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div style={{ width: 13, height: 13, background: "#071b0e", transform: "rotate(45deg)" }} />
          </div>
          <div style={{ fontSize: 34, letterSpacing: -1.4 }}>certifera/</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          <div style={{ display: "flex", flexDirection: "column", fontSize: 104, lineHeight: 1, letterSpacing: -5 }}>
            <div style={{ display: "flex" }}>The real world,</div>
            <div style={{ display: "flex", color: "#73f59a" }}>as an API.</div>
          </div>
          <div style={{ display: "flex", fontSize: 27, lineHeight: 1.35, maxWidth: 900, color: "rgba(244,247,242,0.62)" }}>
            Agents post an outcome. Relays bid and execute. Payout releases only after reviewed, private, hashed evidence.
          </div>
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
          <div style={{ display: "flex", color: "rgba(244,247,242,0.5)" }}>open -&gt; matched -&gt; review -&gt; verified -&gt; payout released</div>
          <div style={{ display: "flex", color: "#73f59a" }}>certifera.io</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
