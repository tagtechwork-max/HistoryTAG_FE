import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FiAlertTriangle } from "react-icons/fi";

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  /** Optional body (string or node). */
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** danger = red confirm button */
  variant?: "danger" | "default";
  confirmLoading?: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
};

/**
 * In-app confirmation overlay (replaces window.confirm).
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Xác nhận",
  cancelLabel = "Huỷ",
  variant = "default",
  confirmLoading = false,
  onClose,
  onConfirm,
}: ConfirmDialogProps) {
  const busy = confirmLoading;

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
          onMouseDown={(e) => {
            if (busy) return;
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
            className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xl dark:border-slate-700 dark:bg-gray-900"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex gap-4 p-6">
              <div
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
                  variant === "danger"
                    ? "bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-400"
                    : "bg-sky-100 text-sky-600 dark:bg-sky-950/50 dark:text-sky-300"
                }`}
              >
                <FiAlertTriangle className="h-6 w-6" aria-hidden />
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <h2 id="confirm-dialog-title" className="text-lg font-bold text-slate-900 dark:text-white">
                  {title}
                </h2>
                {message != null && message !== "" && (
                  <div className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{message}</div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/80">
              <button
                type="button"
                disabled={busy}
                onClick={onClose}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void onConfirm()}
                className={`rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition disabled:opacity-50 ${
                  variant === "danger"
                    ? "bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-500"
                    : "bg-sky-600 hover:bg-sky-700 dark:bg-sky-600 dark:hover:bg-sky-500"
                }`}
              >
                {busy ? "Đang xử lý…" : confirmLabel}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
