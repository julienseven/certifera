import Link from "next/link";
import { Icon } from "@/components/marketing/icon";
import { docGroups, docsMeta } from "@/content/docs";

function NavTree() {
  return (
    <nav aria-label="Documentation" className="space-y-7">
      {docGroups.map((group) => (
        <div key={group.title}>
          <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/32">{group.title}</p>
          <ul className="mt-2.5 space-y-0.5">
            {group.sections.map((section) => (
              <li key={section.id}>
                {/* `nav-link` is what MotionRoot marks with aria-current as you scroll. */}
                <a
                  href={`#${section.id}`}
                  className="doc-link nav-link block rounded-sm px-3 py-1.5 text-[13px] leading-snug text-white/55"
                >
                  {section.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/**
 * GitBook-style rail: the whole documentation tree, sticky beside the content on
 * desktop, and a plain `<details>` disclosure on a phone — a summary element
 * needs no JavaScript and still animates its own open state.
 */
export function DocsSidebar() {
  return (
    <>
      <aside className="hidden border-r border-line lg:block">
        <div className="sticky top-[76px] max-h-[calc(100vh-76px)] overflow-y-auto px-4 py-8">
          <NavTree />
          <div className="mt-9 rounded-sm border border-line bg-panel p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mint">{docsMeta.version}</p>
            <p className="mt-2 text-[12px] leading-relaxed text-white/45">The surface below is what runs today. Anything not documented here is not shipped.</p>
            <Link href="/launch" className="mt-3 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.13em] text-mint-soft transition-colors hover:text-mint">
              Launch readiness <Icon name="arrow" size={13} />
            </Link>
          </div>
        </div>
      </aside>

      <details className="group border-b border-line px-5 py-3 sm:px-8 lg:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between text-[11px] font-semibold uppercase tracking-[0.15em] text-white/55 [&::-webkit-details-marker]:hidden">
          Documentation menu
          <span className="ease-out-expo text-mint transition-transform duration-300 group-open:rotate-45">
            <Icon name="close" size={14} />
          </span>
        </summary>
        <div className="pb-4 pt-5">
          <NavTree />
        </div>
      </details>
    </>
  );
}
