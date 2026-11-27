import { useSyncExternalStore } from 'react';

/** LST-01 `/leaves` view: the List | Calendar toggle. */
export type LeavesView = 'list' | 'calendar';

/**
 * In memory only (like the old ngrx store): survives navigation inside the
 * SPA, back to `list` after a reload.
 */
let current: LeavesView = 'list';
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setLeavesView(view: LeavesView): void {
  if (view === current) return;
  current = view;
  for (const listener of listeners) listener();
}

export function useLeavesView(): LeavesView {
  return useSyncExternalStore(subscribe, () => current);
}

/** Tests: start every test from the default view (as after a reload). */
export function resetLeavesView(): void {
  setLeavesView('list');
}
