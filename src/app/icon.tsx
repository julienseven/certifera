import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#73f59a",
          borderRadius: 7,
        }}
      >
        {/* Filled, not stroked: the wordmark's 2px outline disappears at 32px. */}
        <div style={{ width: 13, height: 13, background: "#071b0e", transform: "rotate(45deg)" }} />
      </div>
    ),
    { ...size },
  );
}
