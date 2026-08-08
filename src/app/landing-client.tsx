"use client";

import { FormEvent, useEffect, useState } from "react";

// Must match `allowedProfiles` in src/app/api/waitlist/route.ts.
const profiles = [
  ["agent-builder", "Agent builder"],
  ["operator", "Marketplace operator"],
  ["protocol", "Protocol team"],
  ["researcher", "Research / media"],
] as const;

function ArrowIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function CheckIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m5 12 4.2 4.2L19 6.5" />
    </svg>
  );
}

export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [profile, setProfile] = useState("agent-builder");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setMessage("");

    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, profile }),
      });
      const payload = (await response.json()) as { error?: string; alreadyJoined?: boolean };
      if (!response.ok) throw new Error(payload.error || "Could not save your request.");
      setStatus("success");
      setMessage(payload.alreadyJoined ? "You’re already on the signal list." : "You’re on the signal list. We’ll be in touch.");
      setEmail("");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Could not save your request.");
    }
  }

  return (
    <form onSubmit={handleJoin} className="space-y-4" noValidate>
      <label className="block">
        <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.14em] text-mint-ink/60">Work email</span>
        <input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          type="email"
          placeholder="you@company.com"
          className="w-full border-b-2 border-mint-ink/40 bg-transparent px-0 py-3 text-xl tracking-[-0.03em] text-mint-ink outline-none placeholder:text-mint-ink/35 focus:border-mint-ink"
        />
      </label>
      <label className="block">
        <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.14em] text-mint-ink/60">I’m joining as</span>
        <select
          value={profile}
          onChange={(event) => setProfile(event.target.value)}
          className="w-full appearance-none border-b-2 border-mint-ink/40 bg-transparent px-0 py-3 text-[15px] text-mint-ink outline-none focus:border-mint-ink"
        >
          {profiles.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-col gap-4 pt-3 sm:flex-row sm:items-center">
        <button
          disabled={status === "loading"}
          className="ease-out-expo inline-flex w-fit items-center gap-3 rounded-full bg-mint-ink px-5 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-mint transition-transform duration-300 hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-60"
          type="submit"
        >
          {status === "loading" ? "Sending…" : "Request access"}
          <ArrowIcon />
        </button>
        {message && (
          <p role="status" className={`text-[12px] ${status === "error" ? "text-red-800" : "text-mint-ink/65"}`}>
            {status === "success" && (
              <span className="mr-1 inline-block align-[-3px]">
                <CheckIcon />
              </span>
            )}
            {message}
          </p>
        )}
      </div>
    </form>
  );
}

/**
 * Reveals [data-reveal] nodes on scroll by writing a DOM attribute directly.
 * Deliberately holds no React state, so it cannot trip react-hooks/set-state-in-effect
 * and costs nothing on re-render.
 */
export function ScrollReveal() {
  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    const show = (node: Element) => node.setAttribute("data-visible", "true");

    if (typeof IntersectionObserver === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      nodes.forEach(show);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          show(entry.target);
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.15 },
    );

    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  return null;
}
