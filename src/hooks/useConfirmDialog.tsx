import { useCallback, useRef, useState, type ReactNode } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog";

export type AskConfirmOptions = {
  title: string;
  message?: ReactNode;
  variant?: "danger" | "default";
  confirmLabel?: string;
  cancelLabel?: string;
};

/**
 * In-app yes/no prompt (replaces window.confirm / confirm).
 * Render `dialog` once near the root of your component tree.
 */
export function useConfirmDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [opts, setOpts] = useState<AskConfirmOptions>({ title: "" });
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const ask = useCallback((options: AskConfirmOptions): Promise<boolean> => {
    setOpts(options);
    setLoading(false);
    setOpen(true);
    return new Promise((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const handleClose = useCallback(() => {
    if (loading) return;
    setOpen(false);
    resolverRef.current?.(false);
    resolverRef.current = null;
  }, [loading]);

  const handleConfirm = useCallback(() => {
    setOpen(false);
    resolverRef.current?.(true);
    resolverRef.current = null;
  }, []);

  const dialog = (
    <ConfirmDialog
      open={open}
      title={opts.title}
      message={opts.message}
      variant={opts.variant ?? "default"}
      confirmLabel={opts.confirmLabel}
      cancelLabel={opts.cancelLabel}
      confirmLoading={loading}
      onClose={handleClose}
      onConfirm={handleConfirm}
    />
  );

  return { ask, dialog, setConfirmLoading: setLoading };
}
