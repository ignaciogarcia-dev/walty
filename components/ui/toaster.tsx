"use client";

import { useEffect, useRef, useState } from "react";
import {
  X,
  CheckCircle,
  XCircle,
  Info,
  ArrowSquareOut,
} from "@phosphor-icons/react";
import { useToastStore, type Toast } from "@/hooks/useToast";
import { cn } from "@/utils/style";

// ─── Single toast item ────────────────────────────────────────────────────────

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Animate in
  useEffect(() => {
    const id = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(id);
  }, []);

  function dismiss() {
    setLeaving(true);
    timerRef.current = setTimeout(() => onDismiss(toast.id), 300);
  }

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const icons = {
    success: (
      <CheckCircle weight="fill" className="size-4 shrink-0 text-emerald-500" />
    ),
    error: <XCircle weight="fill" className="size-4 shrink-0 text-destructive" />,
    info: <Info weight="fill" className="size-4 shrink-0 text-blue-500" />,
  };

  const accent = {
    success: "border-l-emerald-500",
    error: "border-l-destructive",
    info: "border-l-blue-500",
  };

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={cn(
        // Base
        "relative flex w-full max-w-sm items-start gap-3 rounded-2xl border border-l-4 bg-card px-4 py-3.5 shadow-lg",
        // Accent left border
        accent[toast.variant],
        // Transition
        "transition-all duration-300 ease-out",
        visible && !leaving
          ? "translate-y-0 opacity-100"
          : "translate-y-2 opacity-0",
      )}
    >
      {/* Icon */}
      <span className="mt-0.5">{icons[toast.variant]}</span>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-0.5 min-w-0">
        <p className="text-sm font-semibold text-foreground leading-snug">
          {toast.title}
        </p>
        {toast.description && (
          <p className="text-xs text-muted-foreground leading-snug">
            {toast.description}
          </p>
        )}
        {toast.href && (
          <a
            href={toast.href}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Ver transacción
            <ArrowSquareOut className="size-3" />
          </a>
        )}
      </div>

      {/* Dismiss */}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Cerrar"
        className="cursor-pointer shrink-0 rounded-md p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

// ─── Toaster (mount once in layout) ──────────────────────────────────────────

export function Toaster() {
  const { toasts, dismiss } = useToastStore();

  return (
    <div
      aria-label="Notificaciones"
      className="fixed bottom-4 right-4 z-[9999] flex flex-col-reverse gap-2 items-end pointer-events-none"
    >
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto w-full max-w-sm">
          <ToastItem toast={t} onDismiss={dismiss} />
        </div>
      ))}
    </div>
  );
}
