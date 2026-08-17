"use client";

import { FormEvent, useState } from "react";
import { Icon } from "@/components/marketing/icon";

// Must match `allowedProfiles` in src/app/api/waitlist/route.ts.
const profiles = [
  ["agent-builder", "Agent builder"],
  ["operator", "Marketplace operator"],
  ["protocol", "Protocol team"],
  ["researcher", "Research / media"],
] as const;

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
          className="ease-out-expo w-full border-b-2 border-mint-ink/40 bg-transparent px-0 py-3 text-xl tracking-[-0.03em] text-mint-ink outline-none transition-colors duration-300 placeholder:text-mint-ink/35 focus:border-mint-ink"
        />
      </label>
      <label className="block">
        <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.14em] text-mint-ink/60">I’m joining as</span>
        <select
          value={profile}
          onChange={(event) => setProfile(event.target.value)}
          className="ease-out-expo w-full appearance-none border-b-2 border-mint-ink/40 bg-transparent px-0 py-3 text-[15px] text-mint-ink outline-none transition-colors duration-300 focus:border-mint-ink"
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
          className="ease-out-expo group inline-flex w-fit items-center gap-3 rounded-full bg-mint-ink px-5 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-mint transition-transform duration-300 hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-60"
          type="submit"
        >
          {status === "loading" ? "Sending…" : "Request access"}
          <span className={`ease-out-expo transition-transform duration-300 ${status === "loading" ? "animate-nudge" : "group-hover:translate-x-1"}`}>
            <Icon name="arrow" size={16} />
          </span>
        </button>
        {message && (
          <p role="status" className={`animate-rise text-[12px] ${status === "error" ? "text-red-800" : "text-mint-ink/65"}`}>
            {status === "success" && (
              <span className="mr-1 inline-block align-[-3px]">
                <Icon name="check" size={14} />
              </span>
            )}
            {message}
          </p>
        )}
      </div>
    </form>
  );
}
