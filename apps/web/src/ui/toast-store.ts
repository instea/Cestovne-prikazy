/**
 * A toast's text is produced at render time, so a language switch
 * re-translates toasts that are already visible (NFR-13).
 */
export interface Toast {
  id: number;
  message: () => string;
}

let toasts: Toast[] = [];

export const getToasts = (): Toast[] => toasts;
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Pass a function (e.g. `() => errorMessage(e)`) for translated text. */
export function showToast(
  message: string | (() => string),
  timeoutMs = 6000,
): void {
  const id = nextId++;
  const text = typeof message === 'string' ? () => message : message;
  toasts = [...toasts, { id, message: text }];
  emit();
  setTimeout(() => dismissToast(id), timeoutMs);
}

export function dismissToast(id: number): void {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function subscribeToasts(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
