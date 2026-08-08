"use client";

import { useState } from "react";

type DemoKeys = {
  expiresAt: string;
  relayId: string;
  operator: { token: string };
  relay: { token: string };
};

export function DemoKeyButton() {
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [keys, setKeys] = useState<DemoKeys | null>(null);
  const [error, setError] = useState("");

  async function generate() {
    setStatus("loading");
    setError("");
    try {
      const response = await fetch("/api/demo/api-key", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not generate demo keys.");
      setKeys(payload as DemoKeys);
      setStatus("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate demo keys.");
      setStatus("error");
    }
  }

  return (
    <div className="mt-7 rounded-xl border border-[#73f59a]/20 bg-[#73f59a]/[0.05] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#73f59a]">Try it now, no signup</p>
          <p className="mt-1 text-[12px] leading-relaxed text-white/55">Two-hour keys scoped to a dedicated demo operator and demo relay. Run the full request → bid → evidence → proof → review → settlement lifecycle.</p>
        </div>
        <button
          onClick={generate}
          disabled={status === "loading"}
          className="shrink-0 rounded-full bg-[#73f59a] px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.13em] text-[#071b0e] transition-transform hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-60"
        >
          {status === "loading" ? "Generating…" : "Generate demo keys"}
        </button>
      </div>

      {status === "error" && <p className="mt-4 text-[12px] text-red-300">{error}</p>}

      {status === "ready" && keys && (
        <div className="mt-5 space-y-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-white/40">Operator key (fund, select, review, settle)</p>
            <pre className="mt-1.5 overflow-x-auto rounded-lg border border-white/10 bg-black/30 p-3 text-[11px] text-[#a8ffbe]">{keys.operator.token}</pre>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-white/40">Relay key (bid, upload evidence, submit proof)</p>
            <pre className="mt-1.5 overflow-x-auto rounded-lg border border-white/10 bg-black/30 p-3 text-[11px] text-[#a8ffbe]">{keys.relay.token}</pre>
          </div>
          <p className="text-[11px] text-white/40">Relay id for bids: <span className="font-mono text-white/60">{keys.relayId}</span> · expires {new Date(keys.expiresAt).toLocaleTimeString()}</p>
          <pre className="overflow-x-auto rounded-lg border border-white/10 bg-black/30 p-3 text-[11px] leading-relaxed text-white/60"><code>{`curl -X POST http://localhost:3000/api/requests \\
  -H "Authorization: Bearer ${keys.operator.token}" \\
  -H "Content-Type: application/json" \\
  -d '{"title":"Verify panel array condition","category":"Infrastructure","location":"Austin, TX","reward":180}'`}</code></pre>
        </div>
      )}
    </div>
  );
}
