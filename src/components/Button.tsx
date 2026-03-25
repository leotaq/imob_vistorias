"use client";

import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

type Props = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "secondary" | "danger";
    size?: "sm" | "md";
  }
>;

export default function Button({
  children,
  className,
  variant = "primary",
  size = "md",
  ...props
}: Props) {
  const base =
    "inline-flex items-center justify-center rounded-xl font-semibold transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50";
  const sizes = size === "sm" ? "h-9 px-3 text-sm" : "h-11 px-4 text-sm";
  const variants =
    variant === "primary"
      ? "border border-[var(--accent-strong)] bg-[var(--accent)] text-white shadow-[0_10px_24px_rgba(0,103,252,0.32)] hover:bg-[var(--accent-strong)]"
      : variant === "danger"
        ? "border border-red-700 bg-gradient-to-b from-red-600 to-red-700 text-white shadow-[0_10px_24px_rgba(220,38,38,0.28)] hover:from-red-500 hover:to-red-700"
        : "border border-slate-300 bg-white text-slate-800 shadow-sm hover:bg-slate-100";

  return (
    <button
      {...props}
      className={[base, sizes, variants, className].filter(Boolean).join(" ")}
    >
      {children}
    </button>
  );
}
