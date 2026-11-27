import {
  AUDIT_ACTIONS,
  AUDIT_DEFAULT_PAGE_SIZE,
  AUDIT_TARGET_TYPES,
  type AuditAction,
  type AuditTargetType,
} from '@leaves/shared/audit';
import { isIsoDate, type IsoDate } from '@leaves/shared/workdays';

/**
 * NFR-06 `/audit` filter. Kept in the URL query with the API's parameter
 * names, so the URL and the `GET /api/admin/audit` query are the same.
 */
export interface AuditFilter {
  /** `cli` = CLI actor; otherwise `actorId` selects a user. */
  actorType?: 'cli';
  actorId?: string;
  targetType?: AuditTargetType;
  targetId?: string;
  actions: AuditAction[];
  from?: IsoDate;
  to?: IsoDate;
  page: number;
}

export const EMPTY_FILTER: AuditFilter = { actions: [], page: 1 };

const isAction = (v: string): v is AuditAction =>
  (AUDIT_ACTIONS as readonly string[]).includes(v);

const isTargetType = (v: string | null): v is AuditTargetType =>
  (AUDIT_TARGET_TYPES as readonly (string | null)[]).includes(v);

/** Values that are not valid are dropped (a hand-edited URL never errors). */
export function filterFromParams(params: URLSearchParams): AuditFilter {
  const filter: AuditFilter = { actions: [], page: 1 };
  if (params.get('actorType') === 'cli') filter.actorType = 'cli';
  const actorId = params.get('actorId')?.trim();
  if (actorId && !filter.actorType) filter.actorId = actorId;
  const targetType = params.get('targetType');
  if (isTargetType(targetType)) filter.targetType = targetType;
  const targetId = params.get('targetId')?.trim();
  if (targetId) filter.targetId = targetId;
  const actions = params
    .getAll('action')
    .flatMap((v) => v.split(','))
    .filter(isAction);
  filter.actions = AUDIT_ACTIONS.filter((a) => actions.includes(a));
  const from = params.get('from');
  if (isIsoDate(from)) filter.from = from;
  const to = params.get('to');
  if (isIsoDate(to)) filter.to = to;
  const page = Number(params.get('page'));
  if (Number.isInteger(page) && page >= 1) filter.page = page;
  return filter;
}

/** URL query; empty values and page 1 are left out. */
export function filterToParams(filter: AuditFilter): URLSearchParams {
  const params = new URLSearchParams();
  if (filter.actorType) params.set('actorType', filter.actorType);
  else if (filter.actorId) params.set('actorId', filter.actorId);
  if (filter.targetType) params.set('targetType', filter.targetType);
  const targetId = filter.targetId?.trim();
  if (targetId) params.set('targetId', targetId);
  for (const action of filter.actions) params.append('action', action);
  if (filter.from) params.set('from', filter.from);
  if (filter.to) params.set('to', filter.to);
  if (filter.page > 1) params.set('page', String(filter.page));
  return params;
}

/** Query string of `GET /api/admin/audit` (always with page and page size). */
export function auditApiQuery(filter: AuditFilter): string {
  const params = filterToParams(filter);
  params.set('page', String(filter.page));
  params.set('pageSize', String(AUDIT_DEFAULT_PAGE_SIZE));
  return params.toString();
}

/** Client check before sending: `from` must not be after `to`. */
export function isRangeInvalid(filter: Pick<AuditFilter, 'from' | 'to'>) {
  return Boolean(filter.from && filter.to && filter.from > filter.to);
}

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
