import type { CSSProperties } from "react";
import { lifecycle } from "@/content/landing";

/**
 * The state machine as a moving rail. One CSS cycle carries a marker across the
 * stages and lights each as it passes, so the strip shows the lifecycle running
 * rather than printing it.
 */
export function Lifecycle() {
  return (
    <div className="border-b border-line bg-panel px-5 py-7 sm:px-8 lg:px-11">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="lifecycle-scroller -mx-1 overflow-x-auto px-1 pb-1">
          <ol className="lifecycle flex min-w-max items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em]">
            {lifecycle.stages.map(([label, tone], index) => (
              <li key={label} className="flex items-center gap-2">
                <span
                  data-tone={tone}
                  style={{ "--i": index } as CSSProperties}
                  className="lifecycle-stage rounded-full border border-line px-3 py-1.5 text-white/50 data-[tone=mint]:border-mint/30 data-[tone=mint]:text-mint"
                >
                  {label}
                </span>
                {index < lifecycle.stages.length - 1 && <span aria-hidden className="lifecycle-rail" style={{ "--i": index } as CSSProperties} />}
              </li>
            ))}
          </ol>
          <p className="mt-3 pl-1 font-mono text-[11px] tracking-[0.08em] text-white/32">
            <span aria-hidden className="mr-2 text-white/20">↘</span>
            {lifecycle.branch}
          </p>
        </div>
        <p className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-white/32">{lifecycle.footnote}</p>
      </div>
    </div>
  );
}
