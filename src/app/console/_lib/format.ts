import type { RequestStatus } from "@/app/console/_lib/types";

/**
 * Presentation helpers for the operator console.
 *
 * Pure functions of their arguments, so they can be unit tested directly. They
 * previously sat inside the console's client component, where the only way to
 * check `etaLabel(90) === "1h 30m"` was to render the whole page.
 */

export const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export const categories = ["Infrastructure", "Field verification", "Climate data", "Delivery"];

export function requestTone(status: RequestStatus) {
  if (status === "verified") return "border-[#73f59a]/30 bg-[#73f59a]/10 text-[#abffc0]";
  if (status === "review") return "border-[#c5a8ff]/35 bg-[#c5a8ff]/10 text-[#e0d3ff]";
  if (status === "disputed") return "border-red-300/35 bg-red-300/[0.09] text-red-100";
  if (status === "matched") return "border-sky-300/30 bg-sky-300/10 text-sky-200";
  return "border-amber-200/20 bg-amber-200/[0.07] text-amber-100";
}

export function etaLabel(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return minutes % 60 ? `${hours}h ${minutes % 60}m` : `${hours}h`;
}
