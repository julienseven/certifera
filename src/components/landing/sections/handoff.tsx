import type { CSSProperties } from "react";
import { handoff } from "@/content/landing";
import { Reveal } from "@/components/marketing/reveal";
import { HandoffArtwork } from "@/components/three/handoff-artwork";

type Lane = (typeof handoff.lanes)[number];
type Node = (typeof handoff.nodes)[number];
type Packet = Lane["packets"][number];
type Anchor = "demand" | "ledger" | "supply" | "fee";

/** Rail names the WebGL layer looks up by; the order matches `handoff.lanes`. */
const RAILS = ["outbound", "inbound"] as const;

/**
 * Places an element in the shared 16-second loop. `--at` is read by globals.css as
 * a negative animation delay, so one number in the content file decides both when a
 * packet flies and when its caption lights.
 */
const beat = (at: number, extra?: CSSProperties) => ({ "--at": String(at), ...extra }) as CSSProperties;

/**
 * The settlement loop, drawn rather than described: a request leaves the builder, a
 * quote comes back, evidence returns, review authorizes, and one payout splits 95/5.
 *
 * Entirely CSS — no client component, no timer, no state. Below `lg` the labelled
 * packets are dropped and only the travelling light on each rail survives, because a
 * pill wide enough to read does not fit a phone-width rail. Under reduced motion the
 * ordered captions are the diagram, and they are already the accessible copy: the
 * rails themselves are decorative and hidden from assistive tech.
 */
export function Handoff() {
  const [demand, ledger, supply] = handoff.nodes;
  const [outbound, inbound] = handoff.lanes;

  return (
    <section id="handoff" className="handoff scroll-mt-[76px] sm:scroll-mt-[88px] border-b border-line px-5 py-14 sm:px-8 lg:px-11 lg:py-20">
      <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-mint">{handoff.eyebrow}</p>
          <Reveal as="h2" className="mt-4 max-w-2xl text-balance text-[clamp(2.05rem,5vw,5.15rem)] font-medium leading-[0.91] tracking-[-0.075em]">
            {handoff.heading}
          </Reveal>
        </div>
        <Reveal as="p" variant="left" delay={120} className="max-w-sm text-[13px] leading-relaxed text-white/50">
          {handoff.standfirst}
        </Reveal>
      </div>

      <Reveal delay={140} variant="blur" className="relative isolate mt-12">
        {/* Measures the boxes below and runs the traffic over them in WebGL. It
            draws behind the cards, which are opaque, so a packet entering a node
            slides under it. */}
        <HandoffArtwork />
        <div className="relative z-10 grid items-start gap-y-2 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.04fr)_minmax(0,0.92fr)_minmax(0,1.04fr)_minmax(0,0.92fr)]">
          <FlowNode node={demand} anchor="demand" />
          <FlowLane lane={outbound} rail={RAILS[0]} />
          <div>
            <FlowNode node={ledger} anchor="ledger" />
            <FeeDrop />
          </div>
          <FlowLane lane={inbound} rail={RAILS[1]} />
          <FlowNode node={supply} anchor="supply" accent />
        </div>
      </Reveal>

      <div className="mt-10 border-t border-line pt-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/32">execution_events · one row per transition</p>
        <ol className="mt-4 flex flex-wrap gap-1.5">
          {handoff.events.map((event) => (
            <li key={event.name} style={beat(event.at)} className="handoff-event rounded-full border border-line px-3 py-1.5 font-mono text-[10.5px] tracking-[0.02em]">
              {event.name}
            </li>
          ))}
        </ol>
      </div>

      <p className="mt-6 max-w-3xl text-[12px] leading-relaxed text-white/45">{handoff.footnote}</p>
    </section>
  );
}

function FlowNode({ node, anchor, accent = false }: { node: Node; anchor: Anchor; accent?: boolean }) {
  return (
    <article
      style={beat(node.at)}
      data-accent={accent || undefined}
      data-flow-node={anchor}
      data-flow-at={node.at}
      className="handoff-node rounded-sm border border-line bg-panel p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/40">{node.role}</p>
        <span aria-hidden className="handoff-pip" />
      </div>
      <h3 className="mt-4 text-[17px] font-medium tracking-[-0.035em]">{node.name}</h3>
      <p className="mt-1.5 font-mono text-[10px] tracking-[0.02em] text-white/32">{node.meta}</p>
      <p className="mt-6 font-mono text-[clamp(1.25rem,2.1vw,1.7rem)] font-medium leading-none tracking-[-0.05em] tabular-nums text-mint">{node.figure}</p>
      <p className="mt-2 text-[12px] leading-relaxed text-white/50">{node.figureLabel}</p>
    </article>
  );
}

function FlowLane({ lane, rail }: { lane: Lane; rail: string }) {
  return (
    <div className="px-1 lg:px-3">
      <div className="handoff-rail" data-flow-rail={rail} aria-hidden>
        {lane.packets.map((packet) => (
          <span
            key={packet.text}
            className="packet-runner"
            style={beat(packet.at, { "--from": packet.dir === "right" ? "0%" : "100%", "--to": packet.dir === "right" ? "100%" : "0%" } as CSSProperties)}
          >
            <span className="packet" data-kind={packet.kind}>
              {packet.text}
            </span>
          </span>
        ))}
      </div>

      <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.14em] text-white/25 lg:mt-8">{lane.caption}</p>
      <ol className="mt-3 space-y-3">
        {lane.packets.map((packet) => (
          <PacketStep key={packet.text} packet={packet} />
        ))}
      </ol>
    </div>
  );
}

function PacketStep({ packet }: { packet: Packet }) {
  return (
    <li style={beat(packet.at)} className="handoff-step">
      <p className="flex items-baseline gap-2 font-mono text-[11px] tracking-[0.01em]">
        <span aria-hidden className="handoff-arrow">
          {packet.dir === "right" ? "→" : "←"}
        </span>
        <span className="handoff-step-label">{packet.text}</span>
      </p>
      <p className="mt-1 pl-5 text-[12px] leading-relaxed text-white/42">{packet.note}</p>
    </li>
  );
}

/** The 5% that never reaches the relay, drawn as the one branch off the main flow. */
function FeeDrop() {
  return (
    <div className="mt-4 flex items-stretch gap-4 pl-5">
      <div className="handoff-drop" data-flow-rail="fee" aria-hidden>
        <span className="packet-runner" data-axis="y" style={beat(handoff.fee.at, { "--from": "0%", "--to": "100%" } as CSSProperties)}>
          <span className="packet" data-kind="money">
            {handoff.fee.text}
          </span>
        </span>
      </div>
      <div
        style={beat(handoff.fee.at)}
        data-flow-node="fee"
        data-flow-at={handoff.fee.at}
        className="handoff-node flex-1 self-end rounded-sm border border-line bg-panel/60 px-4 py-3"
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/40">{handoff.fee.label}</p>
        <p className="mt-1 font-mono text-[15px] tabular-nums text-mint">
          {handoff.fee.value} <span className="text-white/32">· $9.00</span>
        </p>
      </div>
    </div>
  );
}
