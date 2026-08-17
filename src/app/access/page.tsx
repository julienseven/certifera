"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { LatticeArtwork } from "@/components/three/lattice-artwork";

type Mode = "loading" | "setup" | "login";
type View = "auth" | "recovery" | "reset";

export default function AccessPage() {
  const [mode, setMode] = useState<Mode>("loading");
  const [view, setView] = useState<View>("auth");
  const [resetToken, setResetToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"error" | "success">("error");
  const [form, setForm] = useState({ displayName: "", email: "", password: "", setupCode: "", mfaCode: "" });

  /* eslint-disable react-hooks/set-state-in-effect -- one-time mount sync from URL params + initial data fetch, not a render loop */
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const token = query.get("reset") || "";
    setResetToken(token);
    if (token) setView("reset");
    if (query.get("verification") === "success") {
      setMessageKind("success");
      setMessage("Email verified. You can now sign in.");
    } else if (query.get("verification") === "invalid") {
      setMessage("That verification link is invalid or expired.");
    }
    void (async () => {
      try {
        const response = await fetch("/api/auth/setup");
        const payload = (await response.json()) as { setupRequired?: boolean };
        setMode(payload.setupRequired ? "setup" : "login");
      } catch {
        setMessage("Could not check the account service. Please refresh.");
        setMode("login");
      }
    })();
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  function setNotice(text: string, kind: "error" | "success") {
    setMessage(text);
    setMessageKind(kind);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      if (view === "recovery") {
        const response = await fetch("/api/auth/password-reset/request", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: form.email }) });
        const payload = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(payload.error || "Could not start password recovery.");
        setNotice("If an active Certifera account uses that email, a recovery link is on its way.", "success");
        setView("auth");
        return;
      }
      if (view === "reset") {
        const response = await fetch("/api/auth/password-reset/confirm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: resetToken, password: form.password, mfaCode: form.mfaCode }) });
        const payload = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(payload.error || "Could not reset the password.");
        setForm((current) => ({ ...current, password: "", mfaCode: "" }));
        setResetToken("");
        setView("auth");
        setNotice("Password reset complete. Sign in with your new password.", "success");
        window.history.replaceState({}, "", "/access");
        return;
      }
      const endpoint = mode === "setup" ? "/api/auth/setup" : "/api/auth/login";
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
      const payload = (await response.json()) as { error?: string; verificationRequired?: boolean; verificationUrl?: string };
      if (!response.ok) throw new Error(payload.error || "Could not continue.");
      if (mode === "setup" && payload.verificationRequired) {
        setNotice(payload.verificationUrl ? `Administrator created. Open the verification link: ${payload.verificationUrl}` : "Administrator created. Verify the email link before signing in.", "success");
        setMode("login");
        return;
      }
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.assign(next?.startsWith("/") ? next : "/console");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not continue.", "error");
    } finally { setBusy(false); }
  }

  const title = view === "recovery" ? "Recover your workspace." : view === "reset" ? "Choose a new password." : mode === "setup" ? "Create the first administrator." : "Sign in to Certifera.";
  const description = view === "recovery" ? "We’ll send a time-limited recovery link if the email belongs to an active account." : view === "reset" ? "A valid reset link and, for protected accounts, an authenticator code are required." : mode === "setup" ? "This account controls pilot settings, user onboarding, and privileged operations. Use a long, unique password." : "Use your approved operator, reviewer, or relay account to access the private outcome network.";

  return <main className="console-surface relative grid min-h-screen place-items-center overflow-hidden bg-[#060806] px-5 py-10 text-[#f4f7f2]"><LatticeArtwork variant="panel" className="pointer-events-none fixed inset-0 z-0 opacity-75 [mask-image:radial-gradient(ellipse_at_50%_45%,#000_42%,transparent_88%)]" /><section className="glass-panel relative z-10 w-full max-w-md rounded-2xl border border-white/10 p-6 shadow-2xl backdrop-blur-xl sm:p-8"><Link href="/" className="group flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-full bg-[#73f59a] text-[#071b0e] transition-transform group-hover:rotate-45"><span className="h-3 w-3 rotate-45 border-2 border-current" /></span><span className="text-[20px] font-medium tracking-[-0.06em]">certifera<span className="text-[#73f59a]">/</span></span></Link><div className="mt-10"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#73f59a]">{view === "auth" ? (mode === "setup" ? "Secure workspace setup" : "Operator workspace") : "Account recovery"}</p><h1 className="mt-3 text-3xl font-medium leading-[0.95] tracking-[-0.065em]">{title}</h1><p className="mt-4 text-[13px] leading-relaxed text-white/52">{description}</p></div>{mode === "loading" ? <div className="mt-9 h-32 animate-pulse rounded-xl bg-white/[0.04]" /> : <form onSubmit={submit} className="mt-8 space-y-5">{view === "auth" && mode === "setup" && <label className="block"><span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-white/42">Display name</span><input required value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} className="input mt-2" placeholder="Your name" /></label>}{view !== "reset" && <label className="block"><span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-white/42">Work email</span><input required type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="input mt-2" placeholder="you@company.com" /></label>}{view !== "recovery" && <label className="block"><span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-white/42">{view === "reset" ? "New password" : "Password"}</span><input required minLength={12} type="password" autoComplete={view === "reset" || mode === "setup" ? "new-password" : "current-password"} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} className="input mt-2" placeholder={view === "reset" || mode === "setup" ? "12+ characters" : "Your password"} /></label>}{view === "auth" && mode === "setup" && <label className="block"><span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-white/42">Setup code <span className="normal-case tracking-normal text-white/28">optional unless deployment requires it</span></span><input type="password" autoComplete="one-time-code" value={form.setupCode} onChange={(event) => setForm({ ...form, setupCode: event.target.value })} className="input mt-2" placeholder="Deployment setup code" /></label>}{(view === "reset" || (view === "auth" && mode === "login")) && <label className="block"><span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-white/42">Authenticator code <span className="normal-case tracking-normal text-white/28">required if MFA is enabled</span></span><input inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={form.mfaCode} onChange={(event) => setForm({ ...form, mfaCode: event.target.value })} className="input mt-2" placeholder="123456" /></label>}{message && <p role="status" className={`rounded-lg border px-3 py-2 text-[12px] leading-relaxed ${messageKind === "success" ? "border-[#73f59a]/30 bg-[#73f59a]/[0.08] text-[#b7ffca]" : "border-red-300/25 bg-red-300/[0.08] text-red-100"}`}>{message}</p>}<button disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#73f59a] px-4 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[#071b0e] transition-colors hover:bg-[#a1ffba] disabled:cursor-wait disabled:opacity-60" type="submit">{busy ? "Securing access…" : view === "recovery" ? "Send recovery link" : view === "reset" ? "Reset password" : mode === "setup" ? "Create administrator" : "Sign in"}<span aria-hidden>→</span></button></form>}<div className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-[10px] font-semibold uppercase tracking-[0.11em] text-white/40">{view === "auth" && mode === "login" && <button onClick={() => { setView("recovery"); setMessage(""); }} className="hover:text-[#a8ffbe]">Forgot password?</button>}{view !== "auth" && <button onClick={() => { setView("auth"); setMessage(""); }} className="hover:text-[#a8ffbe]">Back to sign in</button>}<Link href="/docs" className="hover:text-[#a8ffbe]">Security docs</Link></div><p className="mt-7 border-t border-white/10 pt-5 text-[10px] leading-relaxed text-white/35">By continuing, you acknowledge that actions are recorded in the Certifera operational audit log.</p></section></main>;
}
