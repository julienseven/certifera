export type IconName = "arrow" | "spark" | "shield" | "layers" | "pulse" | "check" | "menu" | "close";

const paths: Record<IconName, string[]> = {
  arrow: ["M5 12h14M13 6l6 6-6 6"],
  spark: ["m12 3-1.7 6.3L4 11l6.3 1.7L12 19l1.7-6.3L20 11l-6.3-1.7L12 3Z", "m19 17-.7 2.3L16 20l2.3.7L19 23l.7-2.3L22 20l-2.3-.7L19 17Z"],
  shield: ["M12 3 5.5 6v5c0 4.4 2.7 8.2 6.5 10 3.8-1.8 6.5-5.6 6.5-10V6L12 3Z", "m9.5 12 1.6 1.6 3.8-4"],
  layers: ["m12 3 8 4.5-8 4.5-8-4.5L12 3Z", "m4 12 8 4.5 8-4.5M4 16.5 12 21l8-4.5"],
  pulse: ["M3 12h4l2.2-6 4.1 12 2.2-6H21"],
  check: ["m5 12 4.2 4.2L19 6.5"],
  menu: ["M4 7h16M4 12h16M4 17h16"],
  close: ["m6 6 12 12M18 6 6 18"],
};

/** One stroked 24px grid for every marketing icon; colour comes from `currentColor`. */
export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {paths[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
