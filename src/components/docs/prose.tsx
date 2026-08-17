import Link from "next/link";
import type { ReactNode } from "react";
import type { Block } from "@/content/docs";
import { DemoKeyButton } from "@/app/docs/demo-key-button";

/**
 * Inline formatter for documentation copy: `code`, **bold**, and [label](href).
 * Deliberately not a markdown parser — three constructs cover every string in
 * the content file, and a parser would pull a dependency in for the difference.
 */
function inline(text: string): ReactNode[] {
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;
  return text.split(pattern).filter(Boolean).map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={index} className="rounded-sm border border-line bg-white/[0.04] px-1.5 py-0.5 font-mono text-[0.85em] text-mint-soft">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={index} className="font-medium text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (link) {
      const [, label, href] = link;
      return href.startsWith("#") ? (
        <a key={index} href={href} className="link-underline text-mint-soft">
          {label}
        </a>
      ) : (
        <Link key={index} href={href} className="link-underline text-mint-soft">
          {label}
        </Link>
      );
    }
    return part;
  });
}

export function ProseBlock({ block }: { block: Block }) {
  if (block.kind === "p") {
    return <p className="mt-5 text-[14px] leading-[1.75] text-white/62">{inline(block.text)}</p>;
  }

  if (block.kind === "h3") {
    return <h3 className="mt-10 text-[17px] font-medium tracking-[-0.03em] text-bone">{block.text}</h3>;
  }

  if (block.kind === "list") {
    const Tag = block.ordered ? "ol" : "ul";
    return (
      <Tag className="mt-5 space-y-2.5">
        {block.items.map((item, index) => (
          <li key={item} className="flex gap-3 text-[14px] leading-[1.7] text-white/62">
            {block.ordered ? (
              <span className="mt-px shrink-0 font-mono text-[12px] text-mint">{String(index + 1).padStart(2, "0")}</span>
            ) : (
              <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-mint" />
            )}
            <span>{inline(item)}</span>
          </li>
        ))}
      </Tag>
    );
  }

  if (block.kind === "code") {
    return (
      <figure className="mt-6 overflow-hidden rounded-sm border border-line bg-black/40">
        {block.caption && (
          <figcaption className="border-b border-line px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-white/35">{block.caption}</figcaption>
        )}
        <pre className="overflow-x-auto p-4 text-[11.5px] leading-relaxed text-mint-soft">
          <code>{block.code}</code>
        </pre>
      </figure>
    );
  }

  if (block.kind === "table") {
    return (
      // Tables scroll inside their own box; the page itself never scrolls sideways.
      <div className="mt-6 overflow-x-auto rounded-sm border border-line">
        <table className="w-full min-w-[520px] border-collapse text-left">
          <thead>
            <tr className="border-b border-line bg-white/[0.03]">
              {block.head.map((cell) => (
                <th key={cell} className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row) => (
              <tr key={row.join("|")} className="border-b border-line last:border-0 hover:bg-mint/[0.03]">
                {row.map((cell, index) => (
                  <td key={index} className="px-4 py-3 align-top text-[13px] leading-relaxed text-white/60">
                    {inline(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (block.kind === "note") {
    const warn = block.tone === "warn";
    return (
      <aside
        className={`mt-6 rounded-sm border-l-2 px-4 py-3.5 ${warn ? "border-l-amber-300/70 bg-amber-200/[0.05]" : "border-l-mint bg-mint/[0.05]"}`}
      >
        <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${warn ? "text-amber-200/80" : "text-mint"}`}>{block.title}</p>
        <p className="mt-2 text-[13px] leading-relaxed text-white/62">{inline(block.text)}</p>
      </aside>
    );
  }

  return (
    <div className="mt-6">
      <DemoKeyButton />
    </div>
  );
}
