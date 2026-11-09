/** Query key of the pending-leaves list; approve/reject invalidates `['leaves']`. */
export const PENDING_LEAVES_KEY = ['leaves', { state: 'PENDING' }] as const;

/**
 * Every leave query starts with `'leaves'`: create (LV-02), delete (LV-03)
 * and approve / reject (APR-01) invalidate `LEAVES_ROOT_KEY`, which refreshes
 * the list, the pending badge and the summary together.
 */
export const LEAVES_ROOT_KEY = ['leaves'] as const;

/** LST-01 list of all leaves (no state filter). */
export const LEAVES_KEY = ['leaves', { state: undefined }] as const;

/** SUM-01 own summary. */
export const LEAVE_SUMMARY_KEY = ['leaves', 'summary'] as const;
