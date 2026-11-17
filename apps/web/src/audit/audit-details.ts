import type { AuditEntryDto } from '@leaves/shared/audit';
import {
  LEAVE_STATES,
  LEAVE_TYPES,
  type LeaveState,
  type LeaveType,
} from '@leaves/shared/leaves';
import { isIsoDate } from '@leaves/shared/workdays';
import type { TFunction } from 'i18next';
import { type Language } from '../i18n';
import { formatDate, formatTimestamp } from '../i18n/format';

type Obj = Record<string, unknown>;

const DASH = '–';
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

const isObj = (v: unknown): v is Obj =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isState = (v: unknown): v is LeaveState =>
  (LEAVE_STATES as readonly unknown[]).includes(v);

const isType = (v: unknown): v is LeaveType =>
  (LEAVE_TYPES as readonly unknown[]).includes(v);

function value(v: unknown, t: TFunction, lang: Language): string {
  if (v === null || v === undefined || v === '') return DASH;
  if (typeof v === 'boolean') return v ? t('common.yes') : t('common.no');
  if (isState(v)) return t(`leaveState.${v}`);
  if (typeof v === 'string' && ISO_INSTANT.test(v)) {
    return formatTimestamp(v, lang);
  }
  if (isIsoDate(v)) return formatDate(v, lang);
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  return JSON.stringify(v);
}

/** Leave snapshot: `<start> – <end>, <type label>, <state label>`. */
function leaveSnapshot(snap: unknown, t: TFunction, lang: Language): string {
  if (!isObj(snap)) return DASH;
  const parts = [
    isIsoDate(snap.startDate) && isIsoDate(snap.endDate)
      ? `${formatDate(snap.startDate, lang)} – ${formatDate(snap.endDate, lang)}`
      : DASH,
    isType(snap.type) ? t(`leaveType.${snap.type}`) : DASH,
    isState(snap.state) ? t(`leaveState.${snap.state}`) : DASH,
  ];
  return parts.join(', ');
}

/** `<key>: <old> → <new>` for every changed key; `<key>: <new>` without a before. */
function changes(details: Obj, t: TFunction, lang: Language): string[] {
  const before = isObj(details.before) ? details.before : undefined;
  const after = isObj(details.after) ? details.after : {};
  const keys = [
    ...new Set([...Object.keys(before ?? {}), ...Object.keys(after)]),
  ];
  return keys.flatMap((key) => {
    if (!before) return [`${key}: ${value(after[key], t, lang)}`];
    if (before[key] === after[key]) return [];
    return [
      `${key}: ${value(before[key], t, lang)} → ${value(after[key], t, lang)}`,
    ];
  });
}

/** NFR-06 Details column: one line per item. */
export function auditDetailLines(
  entry: Pick<AuditEntryDto, 'action' | 'details'>,
  t: TFunction,
  lang: Language,
): string[] {
  const { action, details } = entry;
  if (action === 'USER_DATA_EXPORTED' || !isObj(details)) return [DASH];
  switch (action) {
    case 'LEAVE_APPROVED':
    case 'LEAVE_REJECTED':
      return [
        `${value(details.previousState, t, lang)} → ${value(details.newState, t, lang)}`,
      ];
    case 'LEAVE_CREATED':
      return [leaveSnapshot(details.after, t, lang)];
    case 'LEAVE_DELETED':
      return [leaveSnapshot(details.before, t, lang)];
    default: {
      const lines = changes(details, t, lang);
      return lines.length > 0 ? lines : [DASH];
    }
  }
}
