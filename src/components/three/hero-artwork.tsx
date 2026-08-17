"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const HeroLattice = dynamic(() => import("./hero-lattice"), { ssr: false });

type NetworkInformation = { saveData?: boolean };

/**
 * Why the artwork is or is not on screen, mirrored onto <html data-lattice> so the
 * state is readable in devtools without instrumenting a build.
 */
function report(state: "on" | "save-data" | "no-webgl") {
  document.documentElement.dataset.lattice = state;
}

function webglAvailable() {
  try {
    const probe = document.createElement("canvas");
    return Boolean(probe.getContext("webgl2") || probe.getContext("webgl"));
  } catch {
    return false;
  }
}

/**
 * Defers the WebGL chunk until the browser is idle, so the three.js payload never
 * competes with the hero's first paint. Only a metered connection or a missing
 * WebGL context opts out — everything else scales down instead of disappearing.
 */
export function HeroArtwork({ className }: { className?: string }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const nav = navigator as Navigator & { connection?: NetworkInformation };
    if (nav.connection?.saveData) return report("save-data");
    if (!webglAvailable()) return report("no-webgl");

    const idle = window.requestIdleCallback?.bind(window) ?? ((cb: () => void) => window.setTimeout(cb, 400));
    const cancel = window.cancelIdleCallback?.bind(window) ?? window.clearTimeout;
    const handle = idle(
      () => {
        report("on");
        setMounted(true);
      },
      { timeout: 2500 },
    );

    return () => cancel(handle as number);
  }, []);

  if (!mounted) return null;

  return (
    <div className={className} aria-hidden>
      <HeroLattice density={typeof window !== "undefined" && window.innerWidth < 768 ? "low" : "full"} />
    </div>
  );
}
