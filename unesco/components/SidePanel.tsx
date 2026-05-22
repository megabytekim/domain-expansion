"use client";

import { type ReactNode } from "react";

interface SidePanelProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

export default function SidePanel({ open, onClose, children }: SidePanelProps) {
  if (!open) return null;
  return (
    <aside
      className="hidden md:flex absolute z-20 flex-col paper-grain"
      style={{
        top: "80px",
        left: "16px",
        width: "400px",
        maxHeight: "calc(100dvh - 240px)",
        background: "var(--ink-deep)",
        borderLeft: "3px solid var(--vermillion)",
        borderRadius: "2px",
        boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
      }}
    >
      <button
        onClick={onClose}
        aria-label="닫기"
        className="absolute top-2 right-2 z-10 w-8 h-8 flex items-center justify-center transition-opacity hover:opacity-70"
        style={{ color: "var(--paper-500)", background: "transparent" }}
      >
        ✕
      </button>
      <div className="flex-1 overflow-y-auto px-4 pt-12 pb-4">{children}</div>
    </aside>
  );
}
