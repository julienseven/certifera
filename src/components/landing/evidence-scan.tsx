"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/marketing/icon";
import { captureSamples, type CaptureSample } from "@/content/landing";

const STEP_MS = 620;
const SCAN_MS = 1100;
/** One tick to raise the shutter, then one per signal, then the verdict. */
const stepsFor = (sample: CaptureSample) => sample.signals.length + 2;

const runningScore = (sample: CaptureSample, step: number) =>
  sample.signals.slice(0, Math.max(0, step - 1)).reduce((total, signal) => total + (signal.delta ?? 0), 0);

/**
 * Runs the real scorer over two real photographs, in the open.
 *
 * Each tab pairs the request an agent posted with the evidence that came back,
 * then settles the signals the way `scoreEvidenceSignals()` would: base 55,
 * capture time, GPS, device, payload size. The outdoor array gets its fix and
 * reaches 100; the indoor rack audit does not, and the missing GPS becomes a
 * named flag rather than a silent zero. These are labelled fixtures, not
 * telemetry, and no live upload is involved.
 */
export function EvidenceScan() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [step, setStep] = useState(0);
  const [run, setRun] = useState(0);

  const sample = captureSamples[active];
  const total = stepsFor(sample);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timers: number[] = [];

    // Deferred by a frame rather than set inline: a synchronous setState in an
    // effect body cascades a second render before the first has painted.
    if (reduced || typeof IntersectionObserver === "undefined") {
      const frame = requestAnimationFrame(() => setStep(total));
      return () => cancelAnimationFrame(frame);
    }

    const play = () => {
      for (let index = 1; index <= total; index += 1) {
        timers.push(window.setTimeout(() => setStep(index), SCAN_MS + index * STEP_MS));
      }
    };

    // Switching tab or hitting replay is an explicit act, so it does not wait to
    // be observed again; only the first play does.
    if (run > 0) {
      play();
      return () => timers.forEach(clearTimeout);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        play();
      },
      { threshold: 0.25 },
    );
    observer.observe(host);

    return () => {
      observer.disconnect();
      timers.forEach(clearTimeout);
    };
  }, [run, total]);

  const restart = (index: number) => {
    setActive(index);
    setStep(0);
    setRun((value) => value + 1);
  };

  const scanning = step > 0 && step < total;
  const settled = step >= total;
  const score = settled ? sample.verdict.score : runningScore(sample, step);

  return (
    <div ref={hostRef} className="card overflow-hidden bg-panel">
      {/* --- Which outcome you are looking at ------------------------------ */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-line px-4 py-3 sm:px-5">
        <div role="tablist" aria-label="Evidence samples" className="flex flex-wrap gap-2">
          {captureSamples.map((entry, index) => (
            <button
              key={entry.id}
              role="tab"
              type="button"
              aria-selected={index === active}
              onClick={() => restart(index)}
              className="ease-out-expo min-h-[38px] rounded-full border border-line px-3.5 py-2 text-[11px] font-medium tracking-[-0.01em] text-white/55 transition-colors duration-300 hover:text-mint aria-selected:border-mint/45 aria-selected:bg-mint/[0.08] aria-selected:text-mint-soft"
            >
              {entry.tab}
            </button>
          ))}
        </div>
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/32">
          Evidence / intelligence · <span className="text-mint">sample</span>
        </p>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1fr)]">
        {/* --- What the agent posted, then what came back ------------------ */}
        <div className="border-b border-line lg:border-b-0 lg:border-r">
          <div className="border-b border-line p-5">
            <div className="flex items-center gap-2">
              <span className="rounded-sm border border-mint/30 bg-mint/[0.07] px-2 py-0.5 font-mono text-[10px] text-mint">{sample.request.posted}</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/32">the agent&apos;s request</span>
            </div>
            <pre className="mt-3 overflow-x-auto rounded-sm border border-line bg-black/40 p-3.5 text-[11px] leading-relaxed text-mint-soft">
              <code>{sample.request.body}</code>
            </pre>
            <p className="mt-3 text-[12px] leading-relaxed text-white/45">{sample.request.note}</p>
          </div>

          <figure className="relative m-0">
            <div className="relative overflow-hidden bg-black/40">
              <Image
                key={sample.image.src}
                src={sample.image.src}
                alt={sample.image.alt}
                width={sample.image.width}
                height={sample.image.height}
                sizes="(min-width: 1024px) 46vw, 100vw"
                className="h-auto w-full"
              />

              {/* Sweep: one pass per run, then it parks off the bottom edge. */}
              <div key={`sweep-${sample.id}-${run}`} aria-hidden className="evidence-sweep pointer-events-none absolute inset-0" data-active={step > 0 || undefined} />

              {/* Subject reticle, pinned to what the request actually asked about. */}
              <div
                aria-hidden
                data-visible={step >= 1 || undefined}
                className="ease-out-expo pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 opacity-0 transition-opacity duration-500 data-[visible]:opacity-100"
                style={{ left: `${sample.subject.x}%`, top: `${sample.subject.y}%` }}
              >
                <span className="block h-12 w-12 rounded-sm border border-mint/80 shadow-[0_0_0_1px_rgba(0,0,0,0.4),0_0_22px_-4px_rgba(115,245,154,0.9)]" />
                <span className="mt-2 block w-max max-w-[min(58vw,240px)] rounded-sm bg-ink/85 px-2 py-1 font-mono text-[10px] leading-snug text-mint-soft backdrop-blur-sm">
                  {sample.subject.label}
                </span>
              </div>

              <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line bg-ink/80 px-4 py-2.5 font-mono text-[10px] text-white/55 sm:absolute sm:inset-x-0 sm:bottom-0 sm:border-0 sm:bg-gradient-to-t sm:from-ink sm:via-ink/85 sm:to-transparent sm:pb-3 sm:pt-8">
                {sample.file.map(([key, value]) => (
                  <span key={key}>
                    <span className="text-white/32">{key}</span> {value}
                  </span>
                ))}
              </figcaption>
            </div>
          </figure>
        </div>

        {/* --- The ledger --------------------------------------------------- */}
        <div className="flex flex-col p-5 sm:p-7">
          <div className="flex items-start justify-between gap-4 border-b border-line pb-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-white/45">Capture score</p>
              <p className="mt-1 text-[12px] text-white/40">{scanning ? "Reading metadata…" : settled ? "Scored and flagged" : "Waiting for the asset"}</p>
            </div>
            <p className="shrink-0 font-mono text-[clamp(1.9rem,4vw,2.6rem)] leading-none tracking-[-0.05em] tabular-nums text-mint">
              {score}
              <span className="text-[0.45em] text-white/32"> / 100</span>
            </p>
          </div>

          <ol className="mt-5 space-y-px">
            {sample.signals.map((signal, index) => {
              const state = step >= index + 1 ? (signal.positive ? "on" : "gap") : "off";
              return (
                <li
                  key={signal.label}
                  data-state={state}
                  className="ease-out-expo flex items-baseline gap-3 rounded-sm px-2 py-2 opacity-30 transition-[opacity,background-color] duration-500 data-[state=gap]:bg-amber-200/[0.05] data-[state=gap]:opacity-100 data-[state=on]:bg-mint/[0.05] data-[state=on]:opacity-100"
                >
                  <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${state === "gap" ? "bg-amber-300" : "bg-mint"}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] leading-snug text-white/80">{signal.label}</span>
                    <span className="mt-0.5 block text-[11.5px] leading-relaxed text-white/45">{signal.detail}</span>
                    {signal.flag && state !== "off" && (
                      <span
                        className={`mt-1.5 inline-block max-w-full break-words rounded-full border px-2 py-0.5 font-mono text-[10px] ${
                          signal.positive ? "border-mint/35 text-mint-soft" : "border-amber-300/40 text-amber-200/90"
                        }`}
                      >
                        {signal.flag}
                      </span>
                    )}
                  </span>
                  <span className={`shrink-0 font-mono text-[12px] tabular-nums ${state === "gap" ? "text-amber-200/80" : "text-white/70"}`}>
                    {signal.delta === null ? "—" : signal.delta === 0 ? "ok" : `+${signal.delta}`}
                  </span>
                </li>
              );
            })}
          </ol>

          <div
            data-visible={settled || undefined}
            className="ease-out-expo mt-auto translate-y-2 border-t border-line pt-5 opacity-0 transition-[opacity,transform] duration-700 data-[visible]:translate-y-0 data-[visible]:opacity-100"
          >
            <p className="text-[13px] font-medium text-mint-soft">{sample.verdict.headline}</p>
            <p className="mt-2 text-[12.5px] leading-relaxed text-white/55">{sample.verdict.copy}</p>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="font-mono text-[10px] text-white/28">{sample.image.credit}</p>
              <button
                type="button"
                onClick={() => restart(active)}
                className="group inline-flex min-h-[38px] items-center gap-2 rounded-full border border-line px-3.5 py-2 text-[10px] font-semibold uppercase tracking-[0.13em] text-white/50 transition-colors hover:border-mint/40 hover:text-mint"
              >
                Replay scan
                <span className="ease-out-expo transition-transform duration-300 group-hover:translate-x-0.5">
                  <Icon name="arrow" size={12} />
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
