import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Operations center",
  robots: { index: false, follow: false },
};

export default function OperationsLayout({ children }: { children: ReactNode }) {
  return children;
}
