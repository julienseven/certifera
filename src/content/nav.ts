export type NavLink = readonly [href: string, label: string];

/** Route links for every public page that is not the landing page. */
export const siteLinks: readonly NavLink[] = [
  ["/docs", "Docs"],
  ["/for/agent-builders", "Agents"],
  ["/for/relays", "Relays"],
  ["/security", "Security"],
  ["/faq", "FAQ"],
];

/** The landing page navigates its own sections, so its links are anchors. */
export const landingLinks: readonly NavLink[] = [
  ["#mechanism", "Mechanism"],
  ["#proof", "Proof"],
  ["#api", "API"],
  ["#economics", "Economics"],
  ["/security", "Security"],
  ["/docs", "Docs"],
];

/** Anchors MotionRoot scroll-spies. Order is the reading order; route links never highlight. */
export const spySections = ["top", "mechanism", "proof", "api", "economics", "handoff", "status", "access"] as const;
