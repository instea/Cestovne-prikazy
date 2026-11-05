/** Query key of the pending-leaves list; approve/reject invalidates `['leaves']`. */
export const PENDING_LEAVES_KEY = ['leaves', { state: 'PENDING' }] as const;
