"use client";

import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from "lucide-react";

type AlertType = "success" | "error" | "warning" | "info";

interface AlertDialogProps {
  open: boolean;
  type: AlertType;
  title: string;
  message: string;
  onClose: () => void;
}

const STYLES: Record<
  AlertType,
  { icon: React.ReactNode; box: string; iconColor: string }
> = {
  success: {
    icon: <CheckCircle2 size={20} />,
    box: "border-emerald-200 bg-emerald-50",
    iconColor: "text-emerald-600",
  },
  error: {
    icon: <AlertCircle size={20} />,
    box: "border-red-200 bg-red-50",
    iconColor: "text-red-500",
  },
  warning: {
    icon: <AlertTriangle size={20} />,
    box: "border-amber-200 bg-amber-50",
    iconColor: "text-amber-500",
  },
  info: {
    icon: <Info size={20} />,
    box: "border-sky-200 bg-sky-50",
    iconColor: "text-sky-500",
  },
};

export default function AlertDialog({
  open,
  type,
  title,
  message,
  onClose,
}: AlertDialogProps) {
  if (!open) return null;
  const s = STYLES[type];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/30 p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-md rounded-2xl border p-5 shadow-lg animate-scale-in ${s.box}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span className={`mt-0.5 ${s.iconColor}`}>{s.icon}</span>
          <div className="flex-1">
            {title && (
              <h3 className="text-sm font-semibold text-slate-800 mb-1">{title}</h3>
            )}
            <p className="text-sm leading-relaxed break-all text-slate-700">
              {message}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-white/60 hover:text-slate-600 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-lg bg-slate-800 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700 transition-colors"
          >
            知道了
          </button>
        </div>
      </div>
    </div>
  );
}
