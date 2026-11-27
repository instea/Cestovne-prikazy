/**
 * A toast's text is produced at render time, so a language switch
 * re-translates toasts that are already visible (NFR-13).
 */
export interface Toast {
  id: number;
  message: () => string;
  /** `error` (default, red alert) or `success` (green status). */
  kind: ToastKind;
}

export type ToastKind = 'error' | 'success';

let toasts: Toast[] = [];

export const getToasts = (): Toast[] => toasts;
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Pass a function (e.g. `() => errorMessage(e)`) for translated text. */
export function showToast(
  message: string | (() => string),
  timeoutMs = 6000,
  kind: ToastKind = 'error',
): void {
  const id = nextId++;
  const text = typeof message === 'string' ? () => message : message;
  toasts = [...toasts, { id, message: text, kind }];
  emit();
  setTimeout(() => dismissToast(id), timeoutMs);
}

/** Success confirmation, e.g. "Profile saved." (USR-03). */
export function showSuccessToast(
  message: string | (() => string),
  timeoutMs = 4000,
): void {
  showToast(message, timeoutMs, 'success');
}

export function dismissToast(id: number): void {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function subscribeToasts(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
