import {
  AUDIT_ACTIONS,
  AUDIT_TARGET_TYPES,
  type AuditAction,
  type AuditEntryDto,
  type AuditPageDto,
  type AuditTargetType,
} from '@leaves/shared/audit';
import type { UserDto } from '@leaves/shared/dto';
import { formatUserName } from '@leaves/shared/users';
import { useQuery } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { api } from '../api/client';
import { currentLanguage, type Language } from '../i18n';
import { errorMessage, formatTimestamp } from '../i18n/format';
import { auditDetailLines } from './audit-details';
import {
  type AuditFilter,
  auditApiQuery,
  EMPTY_FILTER,
  filterFromParams,
  filterToParams,
  isRangeInvalid,
  pageCount,
} from './audit-filter';

const CLI = 'cli';
const inputClass =
  'rounded border border-slate-300 bg-white px-2 py-1 text-slate-800';
const buttonClass =
  'rounded bg-slate-800 px-3 py-1 text-white disabled:cursor-not-allowed disabled:opacity-50';

function byName(a: UserDto, b: UserDto): number {
  return formatUserName(a).localeCompare(formatUserName(b));
}

function actorLabel(entry: AuditEntryDto, t: TFunction): string {
  if (entry.actorType === 'cli') return t('audit.actor.cli');
  if (!entry.actor) return t('audit.deletedActor', { id: entry.actorId ?? '' });
  return formatUserName(entry.actor);
}

function targetLabel(
  entry: AuditEntryDto,
  users: Map<string, UserDto>,
  t: TFunction,
): string {
  const base = `${t(`audit.targetType.${entry.targetType}`)} ${entry.targetId}`;
  const user =
    entry.targetType === 'USER' ? users.get(entry.targetId) : undefined;
  return user ? `${base} (${formatUserName(user)})` : base;
}

interface FilterFormProps {
  applied: AuditFilter;
  users: UserDto[];
  onApply: (filter: AuditFilter) => void;
  onClear: () => void;
}

/** Draft filter; applied (to the URL) only by Apply. */
function FilterForm({ applied, users, onApply, onClear }: FilterFormProps) {
  const { t } = useTranslation();
  const id = useId();
  const [draft, setDraft] = useState<AuditFilter>(applied);
  const [rangeError, setRangeError] = useState(false);
  const actorValue = draft.actorType ?? draft.actorId ?? '';

  function apply() {
    if (isRangeInvalid(draft)) {
      setRangeError(true);
      return;
    }
    setRangeError(false);
    onApply({ ...draft, page: 1 });
  }

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
    >
      <div className="flex flex-col">
        <label htmlFor={`${id}-actor`}>{t('audit.filter.actor')}</label>
        <select
          id={`${id}-actor`}
          className={inputClass}
          value={actorValue}
          onChange={(e) => {
            const v = e.target.value;
            setDraft({
              ...draft,
              actorType: v === CLI ? CLI : undefined,
              actorId: v && v !== CLI ? v : undefined,
            });
          }}
        >
          <option value="">{t('audit.filter.all')}</option>
          <option value={CLI}>{t('audit.actor.cli')}</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {formatUserName(u)}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col">
        <label htmlFor={`${id}-ttype`}>{t('audit.filter.targetType')}</label>
        <select
          id={`${id}-ttype`}
          className={inputClass}
          value={draft.targetType ?? ''}
          onChange={(e) =>
            setDraft({
              ...draft,
              targetType: (e.target.value || undefined) as
                AuditTargetType | undefined,
            })
          }
        >
          <option value="">{t('audit.filter.all')}</option>
          {AUDIT_TARGET_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`audit.targetType.${type}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col">
        <label htmlFor={`${id}-tid`}>{t('audit.filter.targetId')}</label>
        <input
          id={`${id}-tid`}
          className={inputClass}
          value={draft.targetId ?? ''}
          onChange={(e) => setDraft({ ...draft, targetId: e.target.value })}
        />
      </div>
      <div className="flex flex-col">
        <label htmlFor={`${id}-action`}>{t('audit.filter.action')}</label>
        <select
          id={`${id}-action`}
          multiple
          className={inputClass}
          value={draft.actions}
          onChange={(e) =>
            setDraft({
              ...draft,
              actions: [...e.target.selectedOptions].map(
                (o) => o.value as AuditAction,
              ),
            })
          }
        >
          {AUDIT_ACTIONS.map((action) => (
            <option key={action} value={action}>
              {t(`audit.action.${action}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col">
        <label htmlFor={`${id}-from`}>{t('audit.filter.from')}</label>
        <input
          id={`${id}-from`}
          type="date"
          className={inputClass}
          value={draft.from ?? ''}
          onChange={(e) =>
            setDraft({ ...draft, from: e.target.value || undefined })
          }
        />
      </div>
      <div className="flex flex-col">
        <label htmlFor={`${id}-to`}>{t('audit.filter.to')}</label>
        <input
          id={`${id}-to`}
          type="date"
          className={inputClass}
          value={draft.to ?? ''}
          aria-invalid={rangeError}
          aria-describedby={rangeError ? `${id}-to-error` : undefined}
          onChange={(e) =>
            setDraft({ ...draft, to: e.target.value || undefined })
          }
        />
        {rangeError && (
          <span id={`${id}-to-error`} className="text-sm text-red-700">
            {t('errors.AUDIT_RANGE_INVALID')}
          </span>
        )}
      </div>
      <button type="submit" className={buttonClass}>
        {t('audit.filter.apply')}
      </button>
      <button
        type="button"
        className="rounded border border-slate-300 px-3 py-1"
        onClick={() => {
          setDraft(EMPTY_FILTER);
          setRangeError(false);
          onClear();
        }}
      >
        {t('leaves.filter.clear')}
      </button>
    </form>
  );
}

function AuditTable({
  page,
  users,
  t,
  lang,
}: {
  page: AuditPageDto;
  users: Map<string, UserDto>;
  t: TFunction;
  lang: Language;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="p-2">{t('audit.table.time')}</th>
            <th className="p-2">{t('audit.table.actor')}</th>
            <th className="p-2">{t('audit.table.action')}</th>
            <th className="p-2">{t('audit.table.target')}</th>
            <th className="p-2">{t('audit.table.details')}</th>
          </tr>
        </thead>
        <tbody>
          {page.items.map((entry) => (
            <tr key={entry.id} className="border-b align-top">
              <td className="p-2 whitespace-nowrap">
                {formatTimestamp(entry.at, lang)}
              </td>
              <td className="p-2">{actorLabel(entry, t)}</td>
              <td className="p-2">{t(`audit.action.${entry.action}`)}</td>
              <td className="p-2">{targetLabel(entry, users, t)}</td>
              <td className="p-2">
                {auditDetailLines(entry, t, lang).map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** NFR-06 `/audit` (admin only, guarded by the route). */
export function AuditPage() {
  const { t } = useTranslation();
  const lang = currentLanguage();
  const [params, setParams] = useSearchParams();
  const filter = filterFromParams(params);
  const query = auditApiQuery(filter);

  const audit = useQuery({
    queryKey: ['audit', query],
    queryFn: () => api<AuditPageDto>(`/admin/audit?${query}`),
  });
  // Actor options and target names; the screen still works without them.
  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: () => api<UserDto[]>('/users'),
    retry: false,
  });
  const users = [...(usersQuery.data ?? [])].sort(byName);
  const usersById = new Map(users.map((u) => [u.id, u]));

  function go(next: AuditFilter) {
    const nextParams = filterToParams(next);
    if (nextParams.toString() === params.toString()) void audit.refetch();
    else setParams(nextParams);
  }

  const data = audit.data;
  const pages = data ? pageCount(data.total, data.pageSize) : 1;
  // A URL page past the end (stale link, entries gone) moves to the last
  // page instead of showing "Page 5 of 2".
  const beyondLast = data !== undefined && filter.page > pages;
  useEffect(() => {
    if (beyondLast) {
      setParams(filterToParams({ ...filter, page: pages }), { replace: true });
    }
    // `filter` is derived from `params` on every render; `beyondLast` and
    // `pages` change whenever a clamp is needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beyondLast, pages, setParams]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t('audit.title')}</h1>
      <FilterForm
        key={params.toString()}
        applied={filter}
        users={users}
        onApply={go}
        onClear={() => go(EMPTY_FILTER)}
      />
      {audit.isPending && <p role="status">{t('common.loading')}</p>}
      {audit.isError && (
        <p role="alert" className="rounded bg-red-100 p-3 text-red-700">
          {t('common.loadListError', { message: errorMessage(audit.error) })}
        </p>
      )}
      {data && data.items.length === 0 && <p>{t('audit.empty')}</p>}
      {data && data.items.length > 0 && (
        <AuditTable page={data} users={usersById} t={t} lang={lang} />
      )}
      {data && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            className={buttonClass}
            disabled={filter.page <= 1}
            onClick={() => go({ ...filter, page: filter.page - 1 })}
          >
            {t('audit.pagination.prev')}
          </button>
          <span>
            {t('audit.pagination.pageOf', { page: filter.page, pages })}
          </span>
          <button
            type="button"
            className={buttonClass}
            disabled={filter.page >= pages}
            onClick={() => go({ ...filter, page: filter.page + 1 })}
          >
            {t('audit.pagination.next')}
          </button>
        </div>
      )}
    </div>
  );
}
