import { TZDate } from '@date-fns/tz';
import {
  AUDIT_ACTIONS,
  AUDIT_ACTOR_TYPES,
  AUDIT_DEFAULT_PAGE_SIZE,
  AUDIT_MAX_PAGE_SIZE,
  AUDIT_TARGET_TYPES,
  type AuditAction,
  type AuditActorType,
  type AuditTargetType,
} from '@leaves/shared/audit';
import { ErrorCode } from '@leaves/shared/enums';
import { isIsoDate, type IsoDate } from '@leaves/shared/workdays';
import { AppException } from '../common/app-exception';

/** First (and default) `page` (validator and OpenAPI). */
export const AUDIT_FIRST_PAGE = 1;

/** Validated `GET /api/admin/audit` query (NFR-06). */
export interface AuditQuery {
  actions?: AuditAction[];
  actorType?: AuditActorType;
  actorId?: string;
  targetType?: AuditTargetType;
  targetId?: string;
  from?: IsoDate;
  to?: IsoDate;
  page: number;
  pageSize: number;
}

const KNOWN = new Set([
  'action',
  'actorType',
  'actorId',
  'targetType',
  'targetId',
  'from',
  'to',
  'page',
  'pageSize',
]);

const invalid = (message: string) =>
  new AppException(400, ErrorCode.VALIDATION_FAILED, message);

/** One string value; a repeated single-value param is invalid. */
function single(raw: Record<string, unknown>, key: string): string | undefined {
  const v = raw[key];
  if (v === undefined) return undefined;
  if (typeof v !== 'string') throw invalid(`${key} must be a single value`);
  return v;
}

function oneOf<T extends string>(
  raw: Record<string, unknown>,
  key: string,
  values: readonly T[],
): T | undefined {
  const v = single(raw, key);
  if (v === undefined) return undefined;
  if (!(values as readonly string[]).includes(v)) {
    throw invalid(`${key} must be one of ${values.join(', ')}`);
  }
  return v as T;
}

function intInRange(
  raw: Record<string, unknown>,
  key: string,
  min: number,
  max: number,
  fallback: number,
): number {
  const v = single(raw, key);
  if (v === undefined) return fallback;
  const n = /^\d+$/.test(v) ? Number(v) : NaN;
  if (!(n >= min && n <= max)) {
    throw invalid(`${key} must be an integer between ${min} and ${max}`);
  }
  return n;
}

function date(raw: Record<string, unknown>, key: string): IsoDate | undefined {
  const v = single(raw, key);
  if (v === undefined) return undefined;
  if (!isIsoDate(v)) throw invalid(`${key} must be a YYYY-MM-DD date`);
  return v;
}

/**
 * `action` may be repeated and/or comma-separated. Unknown params, bad enum
 * values, malformed dates and out-of-range paging → 400 `VALIDATION_FAILED`;
 * `from` after `to` → 400 `AUDIT_RANGE_INVALID`.
 */
export function parseAuditQuery(raw: Record<string, unknown>): AuditQuery {
  const unknown = Object.keys(raw).filter((k) => !KNOWN.has(k));
  if (unknown.length > 0) {
    throw invalid(`Unknown query parameter: ${unknown.join(', ')}`);
  }

  let actions: AuditAction[] | undefined;
  const rawAction = raw.action;
  if (rawAction !== undefined) {
    const values: unknown[] = Array.isArray(rawAction)
      ? (rawAction as unknown[])
      : [rawAction];
    const parts = values.flatMap((v): unknown[] =>
      typeof v === 'string' ? v.split(',') : [v],
    );
    for (const p of parts) {
      if (!(AUDIT_ACTIONS as readonly unknown[]).includes(p)) {
        throw invalid(`action must be one of ${AUDIT_ACTIONS.join(', ')}`);
      }
    }
    actions = [...new Set(parts as AuditAction[])];
  }

  const nonEmpty = (key: string) => {
    const v = single(raw, key);
    if (v === '') throw invalid(`${key} must not be empty`);
    return v;
  };

  const query: AuditQuery = {
    actions,
    actorType: oneOf(raw, 'actorType', AUDIT_ACTOR_TYPES),
    actorId: nonEmpty('actorId'),
    targetType: oneOf(raw, 'targetType', AUDIT_TARGET_TYPES),
    targetId: nonEmpty('targetId'),
    from: date(raw, 'from'),
    to: date(raw, 'to'),
    page: intInRange(
      raw,
      'page',
      AUDIT_FIRST_PAGE,
      Number.MAX_SAFE_INTEGER,
      AUDIT_FIRST_PAGE,
    ),
    pageSize: intInRange(
      raw,
      'pageSize',
      1,
      AUDIT_MAX_PAGE_SIZE,
      AUDIT_DEFAULT_PAGE_SIZE,
    ),
  };
  if (query.from && query.to && query.from > query.to) {
    throw new AppException(
      400,
      ErrorCode.AUDIT_RANGE_INVALID,
      'from must not be after to',
    );
  }
  return query;
}

/** First instant of calendar day `date` in `timeZone`. */
export function startOfDayIn(date: IsoDate, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(new TZDate(y, m - 1, d, 0, 0, 0, 0, timeZone).getTime());
}

/** Last millisecond of calendar day `date` in `timeZone` (23 or 25 h days too). */
export function endOfDayIn(date: IsoDate, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  // Day overflow (e.g. 32) rolls into the next month, as with `Date`.
  const next = new TZDate(y, m - 1, d + 1, 0, 0, 0, 0, timeZone);
  return new Date(next.getTime() - 1);
}

/** Mongo filter for the query (all filters AND-ed). */
export function auditFilter(
  q: AuditQuery,
  timeZone: string,
): Record<string, unknown> {
  const filter: Record<string, unknown> = {};
  if (q.actions) filter.action = { $in: q.actions };
  if (q.actorType) filter.actorType = q.actorType;
  if (q.actorId !== undefined) filter.actorId = q.actorId;
  if (q.targetType) filter.targetType = q.targetType;
  if (q.targetId !== undefined) filter.targetId = q.targetId;
  if (q.from || q.to) {
    const at: Record<string, Date> = {};
    if (q.from) at.$gte = startOfDayIn(q.from, timeZone);
    if (q.to) at.$lte = endOfDayIn(q.to, timeZone);
    filter.at = at;
  }
  return filter;
}
