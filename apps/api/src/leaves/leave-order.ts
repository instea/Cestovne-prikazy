import type { Leave } from './leave.schema';

type Sortable = Pick<Leave, 'id' | 'startDate' | 'createdAt'>;

const cmp = (a: string | number, b: string | number): number =>
  a < b ? -1 : a > b ? 1 : 0;

/**
 * LST-01 list order (interview: UI defaults): `startDate` descending, then
 * `createdAt` descending, then `id` ascending. Binary string compare (like
 * MongoDB), valid for `YYYY-MM-DD` dates.
 */
export function compareLeavesForList(a: Sortable, b: Sortable): number {
  return (
    cmp(b.startDate, a.startDate) ||
    cmp(b.createdAt.getTime(), a.createdAt.getTime()) ||
    cmp(a.id, b.id)
  );
}
