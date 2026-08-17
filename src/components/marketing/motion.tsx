"use client";

import { useEffect, useRef, type ReactNode } from "react";

const REDUCED = "(prefers-reduced-motion: reduce)";
const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia(REDUCED).matches;
/** Touch browsers synthesise hover and pointermove; cursor-tracking effects are for a real cursor. */
const hasFinePointer = () => typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
const NO_SPY: readonly string[] = [];

/**
 * The page's single motion island. One mount wires every scroll- and pointer-driven
 * effect on the landing page through delegated listeners and CSS custom properties,
 * so no section re-renders while you scroll and no component holds motion state.
 *
 *  - `[data-reveal]`      → flipped to `data-visible` once, on entry
 *  - `[data-tilt]`        → `--rx` / `--ry` from the pointer inside the card
 *  - `[data-glow]`        → `--mx` / `--my` for the cursor-following highlight
 *  - `--scroll`           → page progress, read by the header rule
 *  - `.nav-link`          → `aria-current` follows the section in view
 *
 * Under prefers-reduced-motion it reveals everything immediately and wires nothing.
 */
export function MotionRoot({ spy = NO_SPY }: { spy?: readonly string[] }) {
  useEffect(() => {
    const revealNodes = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    const show = (node: Element) => node.setAttribute("data-visible", "true");

    if (typeof IntersectionObserver === "undefined" || prefersReducedMotion()) {
      revealNodes.forEach(show);
      return;
    }

    document.documentElement.dataset.motion = "on";

    const revealObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          show(entry.target);
          revealObserver.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.15 },
    );
    revealNodes.forEach((node) => revealObserver.observe(node));

    // --- Pointer-reactive surfaces ---------------------------------------
    // Delegated: a landing page has dozens of cards, and dozens of per-card
    // listeners cost more than one closest() call per pointer move.
    let tilted: HTMLElement | null = null;

    const resetTilt = () => {
      if (!tilted) return;
      tilted.style.setProperty("--rx", "0deg");
      tilted.style.setProperty("--ry", "0deg");
      tilted.removeAttribute("data-lifted");
      tilted = null;
    };

    const onPointerMove = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const surface = target?.closest<HTMLElement>("[data-tilt],[data-glow]") ?? null;

      if (surface !== tilted) resetTilt();
      if (!surface) return;

      const rect = surface.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;

      surface.style.setProperty("--mx", `${x * 100}%`);
      surface.style.setProperty("--my", `${y * 100}%`);

      if (surface.hasAttribute("data-tilt")) {
        surface.style.setProperty("--ry", `${(x - 0.5) * 7}deg`);
        surface.style.setProperty("--rx", `${(0.5 - y) * 7}deg`);
        surface.setAttribute("data-lifted", "true");
        tilted = surface;
      }
    };

    const fine = hasFinePointer();
    if (fine) {
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      window.addEventListener("blur", resetTilt);
    }

    // --- Scroll progress ---------------------------------------------------
    let queued = false;
    const writeProgress = () => {
      queued = false;
      const span = document.documentElement.scrollHeight - window.innerHeight;
      const progress = span > 0 ? Math.min(1, Math.max(0, window.scrollY / span)) : 0;
      document.documentElement.style.setProperty("--scroll", progress.toFixed(4));
    };
    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(writeProgress);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    writeProgress();

    // --- Scroll spy --------------------------------------------------------
    // The nav marks itself through the DOM rather than through React state, so a
    // section change never re-renders the page under the reader.
    const navLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>("a.nav-link"));
    const sections = spy.map((id) => document.getElementById(id)).filter((node): node is HTMLElement => Boolean(node));
    const visibleSections = new Set<string>();

    const markActive = () => {
      const active = spy.find((id) => visibleSections.has(id));
      navLinks.forEach((link) => {
        const matches = Boolean(active) && link.getAttribute("href") === `#${active}`;
        if (matches) link.setAttribute("aria-current", "true");
        else link.removeAttribute("aria-current");
      });
    };

    const spyObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visibleSections.add(entry.target.id);
          else visibleSections.delete(entry.target.id);
        }
        markActive();
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    sections.forEach((section) => spyObserver.observe(section));

    return () => {
      revealObserver.disconnect();
      spyObserver.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("blur", resetTilt);
      window.removeEventListener("scroll", onScroll);
      delete document.documentElement.dataset.motion;
    };
  }, [spy]);

  return null;
}

/**
 * Pulls its child toward the cursor while the pointer is near, and springs back on
 * leave. Applied to the two primary calls to action only — a page where everything
 * chases the cursor reads as noise.
 */
export function Magnetic({ children, strength = 0.35, className }: { children: ReactNode; strength?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const host = ref.current;
    if (!host || prefersReducedMotion() || !hasFinePointer()) return;

    const target = host.firstElementChild as HTMLElement | null;
    if (!target) return;

    let raf = 0;
    const current = { x: 0, y: 0 };
    const goal = { x: 0, y: 0 };

    const settle = () => {
      current.x += (goal.x - current.x) * 0.18;
      current.y += (goal.y - current.y) * 0.18;
      target.style.transform = `translate3d(${current.x.toFixed(2)}px, ${current.y.toFixed(2)}px, 0)`;
      // Stop the loop once it has effectively landed, so an idle page costs nothing.
      if (Math.abs(goal.x - current.x) < 0.05 && Math.abs(goal.y - current.y) < 0.05) {
        target.style.transform = goal.x === 0 && goal.y === 0 ? "" : target.style.transform;
        raf = 0;
        return;
      }
      raf = requestAnimationFrame(settle);
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(settle);
    };

    const onMove = (event: PointerEvent) => {
      const rect = target.getBoundingClientRect();
      const dx = event.clientX - (rect.left + rect.width / 2);
      const dy = event.clientY - (rect.top + rect.height / 2);
      const reach = Math.max(rect.width, rect.height) * 0.9;
      const distance = Math.hypot(dx, dy);
      const pull = distance > reach ? 0 : 1 - distance / reach;
      goal.x = dx * strength * pull;
      goal.y = dy * strength * pull;
      kick();
    };
    const onLeave = () => {
      goal.x = 0;
      goal.y = 0;
      kick();
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      if (raf) cancelAnimationFrame(raf);
      target.style.transform = "";
    };
  }, [strength]);

  return (
    <span ref={ref} className={className}>
      {children}
    </span>
  );
}

const GLYPHS = "▚▞░▒▓#/\\<>0123456789ABCDEF";

/**
 * Settles a headline figure out of noise the first time it scrolls into view.
 * Works on any string — the economics figures are `5%`, `+8 / −12`, `6 h` — where a
 * numeric count-up would need one special case per format.
 */
export function ScrambleText({ text, className, duration = 900 }: { text: string; className?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);

  // No React state: the animation writes text into a node React never re-renders,
  // so a settled figure cannot be re-scrambled by an unrelated parent update.
  useEffect(() => {
    const host = ref.current;
    if (!host || prefersReducedMotion() || typeof IntersectionObserver === "undefined") return;

    let raf = 0;
    let start = 0;

    const step = (now: number) => {
      if (!start) start = now;
      const progress = Math.min(1, (now - start) / duration);
      const locked = Math.floor(progress * text.length);
      host.textContent = text
        .split("")
        .map((character, index) => {
          if (index < locked || character === " ") return character;
          return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        })
        .join("");
      if (progress < 1) raf = requestAnimationFrame(step);
      else host.textContent = text;
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        raf = requestAnimationFrame(step);
      },
      { threshold: 0.4 },
    );
    observer.observe(host);

    return () => {
      observer.disconnect();
      if (raf) cancelAnimationFrame(raf);
      host.textContent = text;
    };
  }, [text, duration]);

  // The real string is always in the DOM for crawlers and assistive tech; the
  // scramble only ever overwrites it visually, between two paints.
  return (
    <span ref={ref} className={className}>
      {text}
    </span>
  );
}
