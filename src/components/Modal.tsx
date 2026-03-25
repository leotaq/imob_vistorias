"use client";

import type { PropsWithChildren } from "react";

export default function Modal({
  open,
  title,
  onClose,
  children,
}: PropsWithChildren<{
  open: boolean;
  title: string;
  onClose: () => void;
}>) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-3 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.25)] sm:max-h-[calc(100dvh-2rem)]">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3">
          <div className="text-sm font-semibold text-slate-900">{title}</div>
          <button
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm font-medium text-slate-700 transition hover:bg-slate-200 hover:text-slate-900"
          >
            Fechar
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto px-5 py-5 text-slate-800">
          {children}
        </div>
      </div>
    </div>
  );
}
