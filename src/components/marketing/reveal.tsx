import type { CSSProperties, ElementType, ReactNode } from "react";

type Variant = "up" | "left" | "right" | "scale" | "blur";

/**
 * Marks a node for the scroll reveal. Deliberately a server component: the hidden
 * state and the transition are pure CSS, and `MotionRoot` flips one attribute when
 * the node scrolls in. Nothing here ships JavaScript or re-renders.
 */
export function Reveal({
  children,
  variant = "up",
  delay = 0,
  className,
  as: Tag = "div",
  style,
}: {
  children: ReactNode;
  variant?: Variant;
  delay?: number;
  className?: string;
  as?: ElementType;
  style?: CSSProperties;
}) {
  return (
    <Tag data-reveal={variant} style={{ "--reveal-delay": `${delay}ms`, ...style } as CSSProperties} className={className}>
      {children}
    </Tag>
  );
}
