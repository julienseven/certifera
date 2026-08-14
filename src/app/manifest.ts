import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Certifera — Verified execution for agents",
    short_name: "Certifera",
    description: "Fund, prove, review, and settle verified physical outcomes through one operational layer.",
    start_url: "/",
    display: "standalone",
    background_color: "#060806",
    theme_color: "#060806",
    categories: ["business", "developer", "productivity"],
    // `icon.tsx` is generated at /icon; declaring it here keeps the installed
    // app and the browser tab on the same mark.
    icons: [{ src: "/icon", sizes: "32x32", type: "image/png" }],
  };
}
