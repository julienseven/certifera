"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { webglReport } from "./webgl";

const HandoffScene = dynamic(() => import("./handoff-scene"), { ssr: false });

type NetworkInformation = { saveData?: boolean };

const DESKTOP = "(min-width: 64rem)";

/**
 * Mounts the WebGL layer over the handoff diagram only where it can improve on the
 * CSS one: a real WebGL context, an unmetered connection, a viewport wide enough for
 * the diagram's row layout, and a reader who has not asked for less motion. Anywhere
 * else this renders nothing at all and the CSS diagram is the diagram.
 *
 * The three.js chunk waits for an idle callback, so it never competes with paint.
 */
export function HandoffArtwork() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const nav = navigator as Navigator & { connection?: NetworkInformation };
    if (nav.connection?.saveData || !webglReport()) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const desktop = window.matchMedia(DESKTOP);
    const idle = window.requestIdleCallback?.bind(window) ?? ((cb: () => void) => window.setTimeout(cb, 400));
    const cancel = window.cancelIdleCallback?.bind(window) ?? window.clearTimeout;
    let handle: number | undefined;

    const sync = () => {
      if (handle !== undefined) cancel(handle);
      if (!desktop.matches) {
        // Stacked, the legend sits between the cards and a rail would cross it.
        setMounted(false);
        return;
      }
      handle = idle(() => setMounted(true), { timeout: 2500 }) as number;
    };

    sync();
    desktop.addEventListener("change", sync);
    return () => {
      desktop.removeEventListener("change", sync);
      if (handle !== undefined) cancel(handle);
    };
  }, []);

  return mounted ? <HandoffScene /> : null;
}
