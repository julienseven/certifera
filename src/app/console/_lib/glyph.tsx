/**
 * The console's inline icon set.
 *
 * Inline SVG rather than an icon dependency, and extracted from the console
 * page so the panels can use it without importing the page component.
 */

export function Glyph({ name, size = 17 }: { name: "arrow" | "plus" | "check" | "refresh" | "bolt" | "clock" | "pin" | "shield" | "alert" | "menu" | "search" | "stack" | "activity" | "wallet"; size?: number }) {
  const base = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (name === "arrow") return <svg width={size} height={size} viewBox="0 0 24 24" {...base}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
  if (name === "plus") return <svg width={size} height={size} viewBox="0 0 24 24" {...base}><path d="M12 5v14M5 12h14" /></svg>;
  if (name === "check") return <svg width={size} height={size} viewBox="0 0 24 24" {...base}><path d="m5 12 4.2 4.2L19 6.5" /></svg>;
  if (name === "bolt") return <svg width={size} height={size} viewBox="0 0 24 24" {...base}><path d="m13 2-9 12h7l-1 8 10-13h-7V2Z" /></svg>;
  if (name === "clock") return <svg width={size} height={size} viewBox="0 0 24 24" {...base}><circle cx="12" cy="12" r="8" /><path d="M12 8v4l2.7 2" /></svg>;
  if (name === "pin") return <svg width={size} height={size} viewBox="0 0 24 24" {...base}><path d="M20 10c0 5.2-8 11-8 11S4 15.2 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></svg>;
  if (name === "shield") return <svg width={size} height={size} viewBox="0 0 24 24" {...base}><path d="M12 3 5.5 6v5c0 4.4 2.7 8.2 6.5 10 3.8-1.8 6.5-5.6 6.5-10V6L12 3Z" /><path d="m9.5 12 1.6 1.6 3.8-4" /></svg>;
  if (name === "alert") return <svg width={size} height={size} viewBox="0 0 24 24" {...base}><path d="M12 4 3.7 19h16.6L12 4Z" /><path d="M12 9v4M12 16h.01" /></svg>;
  if (name === "menu") return <svg width={size} height={size} viewBox="0 0 24 24" {...base}><path d="M4 7h16M4 12h16M4 17h16" /></svg>;
  if (name === "search") return <svg width={size} height={size} viewBox="0 0 24 24" {...base}><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></svg>;
  if (name === "stack") return <svg width={size} height={size} viewBox="0 0 24 24" {...base}><path d="m12 3 8 4.5-8 4.5-8-4.5L12 3Z" /><path d="m4 12 8 4.5 8-4.5M4 16.5 12 21l8-4.5" /></svg>;
  if (name === "activity") return <svg width={size} height={size} viewBox="0 0 24 24" {...base}><path d="M3 12h4l2-5 4 10 2-5h8" /></svg>;
  if (name === "wallet") return <svg width={size} height={size} viewBox="0 0 24 24" {...base}><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H19v14H6.5A2.5 2.5 0 0 1 4 16.5v-9Z" /><path d="M4 8h15M15 13h2" /></svg>;
  return <svg width={size} height={size} viewBox="0 0 24 24" {...base}><path d="M20 11a8 8 0 1 0 2 5.5" /><path d="M20 4v7h-7" /></svg>;
}
