"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "./icon";

export type HeaderLink = readonly [href: string, label: string];

/**
 * The one header for every public page. Route pages pass their own links and an
 * `active` path; the landing page passes anchors and lets `MotionRoot` scroll-spy
 * `aria-current` instead. Below `md` the links move into a sheet — before this,
 * content pages had no navigation at all on a phone.
 */
export function SiteHeader({
  links,
  active,
  homeHref = "/",
  progress = false,
}: {
  links: readonly HeaderLink[];
  active?: string;
  homeHref?: string;
  progress?: boolean;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    // A sheet that scrolls the page behind it reads as a broken overlay.
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const close = () => setOpen(false);

  const renderLink = (href: string, label: string, className: string) =>
    href.startsWith("#") ? (
      <a key={href} href={href} onClick={close} className={className}>
        {label}
      </a>
    ) : (
      <Link key={href} href={href} onClick={close} aria-current={active === href ? "page" : undefined} className={className}>
        {label}
      </Link>
    );

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-ink/85 backdrop-blur-xl supports-[backdrop-filter]:bg-ink/70">
      <nav className="mx-auto flex h-[68px] max-w-[1440px] items-center justify-between gap-3 px-5 sm:h-[76px] sm:px-8 lg:px-11">
        <Link href={homeHref} onClick={close} className="group flex shrink-0 items-center gap-3" aria-label="Certifera home">
          <span className="ease-out-expo grid h-7 w-7 place-items-center rounded-full bg-mint text-mint-ink transition-transform duration-300 group-hover:rotate-45">
            <span className="h-2.5 w-2.5 rotate-45 border-[2px] border-current" />
          </span>
          <span className="text-[17px] font-medium tracking-[-0.05em] sm:text-[18px]">
            certifera<span className="text-mint">/</span>
          </span>
        </Link>

        <div className="hidden items-center gap-6 text-[11px] font-medium uppercase tracking-[0.16em] text-white/55 md:flex lg:gap-7">
          {links.map(([href, label]) => renderLink(href, label, `nav-link ${active === href ? "text-mint" : ""}`))}
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-4">
          <Link
            href="/access?next=/console"
            className="hidden text-[10px] font-bold uppercase tracking-[0.13em] text-white/48 transition-colors hover:text-mint-soft lg:block"
          >
            Sign in
          </Link>
          <Link
            href="/#access"
            onClick={close}
            className="ease-out-expo inline-flex items-center gap-2 rounded-full border border-mint/50 bg-mint/10 px-3.5 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-mint-soft transition-[background-color,color,box-shadow] duration-300 hover:bg-mint hover:text-mint-ink hover:shadow-[0_0_28px_-6px_rgba(115,245,154,0.7)] sm:px-4"
          >
            {/* Below 26rem there is no room for the full label next to the burger. */}
            <span className="hidden xs:inline">Request access</span>
            <span className="xs:hidden">Access</span>
            <Icon name="arrow" size={14} />
          </Link>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="site-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line text-white/70 transition-colors hover:border-mint/40 hover:text-mint md:hidden"
          >
            <Icon name={open ? "close" : "menu"} size={16} />
          </button>
        </div>
      </nav>

      {/* Height-animated rather than display-toggled, so the sheet slides instead of snapping. */}
      <div
        id="site-menu"
        data-open={open}
        className="ease-out-expo grid grid-rows-[0fr] overflow-hidden border-line transition-[grid-template-rows] duration-500 data-[open=true]:grid-rows-[1fr] data-[open=true]:border-t md:hidden"
      >
        <div className="min-h-0">
          <div className="mx-auto flex max-w-[1440px] flex-col px-5 py-2 sm:px-8">
            {links.map(([href, label]) =>
              renderLink(
                href,
                label,
                "border-b border-line py-4 text-[12px] font-medium uppercase tracking-[0.16em] text-white/60 transition-colors hover:text-mint",
              ),
            )}
            <Link href="/access?next=/console" onClick={close} className="py-4 text-[12px] font-medium uppercase tracking-[0.16em] text-mint-soft">
              Sign in
            </Link>
          </div>
        </div>
      </div>

      {/* Reading progress. Transform-only, driven by the --scroll variable. */}
      {progress && <div aria-hidden className="scroll-progress" />}
    </header>
  );
}
