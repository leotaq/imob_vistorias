import { INSPECTION_STATUS_LABEL } from "@/lib/labels";

type StatusStyle = { background: string; color: string; boxShadow: string };

const STATUS_STYLE: Record<
  "new" | "received" | "in_progress" | "completed" | "awaiting_contract" | "finalized" | "canceled",
  StatusStyle
> = {
  new: {
    background: "rgba(139,92,246,0.18)",
    color: "#c4b5fd",
    boxShadow: "0 0 0 1px rgba(139,92,246,0.4)",
  },
  received: {
    background: "rgba(59,130,246,0.18)",
    color: "#93c5fd",
    boxShadow: "0 0 0 1px rgba(59,130,246,0.4)",
  },
  in_progress: {
    background: "rgba(245,158,11,0.18)",
    color: "#fcd34d",
    boxShadow: "0 0 0 1px rgba(245,158,11,0.4)",
  },
  completed: {
    background: "rgba(16,185,129,0.18)",
    color: "#6ee7b7",
    boxShadow: "0 0 0 1px rgba(16,185,129,0.4)",
  },
  awaiting_contract: {
    background: "rgba(249,115,22,0.18)",
    color: "#fdba74",
    boxShadow: "0 0 0 1px rgba(249,115,22,0.4)",
  },
  finalized: {
    background: "#065f46",
    color: "#a7f3d0",
    boxShadow: "0 0 0 1px #047857",
  },
  canceled: {
    background: "rgba(100,116,139,0.18)",
    color: "#94a3b8",
    boxShadow: "0 0 0 1px rgba(100,116,139,0.35)",
  },
};

export default function StatusBadge({
  status,
}: {
  status: keyof typeof STATUS_STYLE;
}) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={STATUS_STYLE[status]}
    >
      {INSPECTION_STATUS_LABEL[status]}
    </span>
  );
}
