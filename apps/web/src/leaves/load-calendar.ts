/**
 * LST-03: the lazily loaded Calendar view chunk (FullCalendar, ~62 kB gzip).
 * A function of its own so that Retry can import it again and tests can make
 * the import fail.
 */
export const loadLeavesCalendar = () =>
  import('./LeavesCalendar').then((m) => ({ default: m.LeavesCalendar }));
