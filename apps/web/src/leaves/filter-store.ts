import type { LeaveDto } from '@leaves/shared/dto';
import {
  isMatchingFilter,
  type LeaveListFilter,
  toFilterableLeave,
} from '@leaves/shared/filters';
import { useSyncExternalStore } from 'react';

/** LST-02 selections; every key is always present (empty = no restriction). */
export type LeavesFilter = Required<LeaveListFilter>;

export const EMPTY_LEAVES_FILTER: LeavesFilter = Object.freeze({
  requesterIds: [],
  months: [],
  years: [],
});

/**
 * In memory only, shared by the list and the calendar view (like the old
 * ngrx store): survives navigation inside the SPA, empty after a reload.
 */
let current: LeavesFilter = EMPTY_LEAVES_FILTER;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setLeavesFilter(changes: Partial<LeavesFilter>): void {
  current = { ...current, ...changes };
  for (const listener of listeners) listener();
}

/** "Clear filter": all three selections empty. */
export function clearLeavesFilter(): void {
  if (current === EMPTY_LEAVES_FILTER) return;
  current = EMPTY_LEAVES_FILTER;
  for (const listener of listeners) listener();
}

export function useLeavesFilter(): LeavesFilter {
  return useSyncExternalStore(subscribe, () => current);
}

/** The leaves matching `filter`, in their original order (list + calendar). */
export function filterLeaves(
  leaves: LeaveDto[],
  filter: LeaveListFilter,
): LeaveDto[] {
  return leaves.filter((leave) =>
    isMatchingFilter(toFilterableLeave(leave), filter),
  );
}
