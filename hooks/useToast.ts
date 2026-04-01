"use client";
import { useCallback, useSyncExternalStore } from "react";

export type ToastVariant = "success" | "error" | "info";

export type Toast = {
  id: string;
  variant: ToastVariant;
  title: string;
  description?: string;
  /** Link shown as "View transaction ↗" */
  href?: string;
  duration?: number;
};

type Listener = () => void;

// ─── Tiny external store (no React context needed) ───────────────────────────

let toasts: Toast[] = [];
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((l) => l());
}

function addToast(toast: Omit<Toast, "id">): string {
  const id = Math.random().toString(36).slice(2);
  const duration = toast.duration ?? 5000;
  toasts = [...toasts, { ...toast, id, duration }];
  notify();
  if (duration > 0) {
    setTimeout(() => removeToast(id), duration);
  }
  return id;
}

function removeToast(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  notify();
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return toasts;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Imperative API — usable outside React (e.g. inside useWallet async functions) */
export const toast = {
  success: (
    title: string,
    opts?: Partial<Omit<Toast, "id" | "variant" | "title">>,
  ) => addToast({ variant: "success", title, ...opts }),
  error: (
    title: string,
    opts?: Partial<Omit<Toast, "id" | "variant" | "title">>,
  ) => addToast({ variant: "error", title, ...opts }),
  info: (
    title: string,
    opts?: Partial<Omit<Toast, "id" | "variant" | "title">>,
  ) => addToast({ variant: "info", title, ...opts }),
  dismiss: removeToast,
};

/** React hook — subscribe to the toast list */
export function useToastStore() {
  const items = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const dismiss = useCallback((id: string) => removeToast(id), []);
  return { toasts: items, dismiss };
}
