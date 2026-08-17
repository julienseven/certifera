"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { Variant } from "./lattice-scene";

const LatticeScene = dynamic(() => import("./lattice-scene"), { ssr: false });

type NetworkInformation = { saveData?: boolean };
type State = "on" | "save-data" | "no-webgl";

function webglReport() {
  try {
    const probe = document.createElement("canvas");
    const gl = (probe.getContext("webgl2") || probe.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return null;
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    return info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "available";
  } catch {
    return null;
  }
}

/**
 * Defers the WebGL chunk until the browser is idle, so the three.js payload never
 * competes with first paint. Only a metered connection or a missing WebGL context
 * opts out — everything else scales down instead of disappearing.
 *
 * Append `?lattice=debug` to any URL to see why, without opening devtools.
 */
export function LatticeArtwork({ className, variant = "hero" }: { className?: string; variant?: Variant }) {
  const [mounted, setMounted] = useState(false);
  const [debug, setDebug] = useState<string | null>(null);

  useEffect(() => {
    const nav = navigator as Navigator & { connection?: NetworkInformation };
    const gpu = webglReport();
    const saveData = Boolean(nav.connection?.saveData);
    const state: State = saveData ? "save-data" : gpu ? "on" : "no-webgl";

    document.documentElement.dataset.lattice = state;

    const wantsDebug = new URLSearchParams(window.location.search).get("lattice") === "debug";
    if (state !== "on" && !wantsDebug) return;

    const idle = window.requestIdleCallback?.bind(window) ?? ((cb: () => void) => window.setTimeout(cb, 400));
    const cancel = window.cancelIdleCallback?.bind(window) ?? window.clearTimeout;

    // Both updates are deferred to the idle callback: the three.js chunk must not
    // land before first paint, and a synchronous setState here would cascade.
    const handle = idle(
      () => {
        if (wantsDebug) {
          setDebug(
            [
              `state: ${state}`,
              `gpu: ${gpu ?? "none"}`,
              `viewport: ${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio}x`,
              `reduced-motion: ${window.matchMedia("(prefers-reduced-motion: reduce)").matches}`,
            ].join("\n"),
          );
        }
        if (state === "on") setMounted(true);
      },
      { timeout: 2500 },
    );

    return () => cancel(handle as number);
  }, []);

  return (
    <>
      {mounted && (
        <div className={className} aria-hidden>
          <LatticeScene variant={variant} density={typeof window !== "undefined" && window.innerWidth < 768 ? "low" : "full"} />
        </div>
      )}
      {debug && (
        <pre className="fixed bottom-3 left-3 z-50 whitespace-pre rounded-sm border border-mint/40 bg-ink/90 p-3 font-mono text-[11px] leading-relaxed text-mint-soft">
          {debug}
          {"\ncanvas: "}
          {mounted ? "mounted" : "not mounted"}
        </pre>
      )}
    </>
  );
}
