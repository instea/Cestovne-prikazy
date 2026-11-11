import type { LeaveDto } from '@leaves/shared/dto';
import { useQuery } from '@tanstack/react-query';
import { lazy, Suspense, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { api } from '../api/client';
import { currentLanguage, type Language } from '../i18n';
import { LEAVES_KEY } from '../layout/query-keys';
import { LoadError } from '../ui/LoadError';
import { Spinner } from '../ui/Spinner';
import { DeleteLeaveAction } from './DeleteLeaveAction';
import {
  clearLeavesFilter,
  filterLeaves,
  useLeavesFilter,
} from './filter-store';
import { LeaveDecisionButtons } from './LeaveDecisionButtons';
import { formatDaysCell, formatUserRefLabel } from './leave-format';
import { LeavesFilters } from './LeavesFilters';
import { type LeavesView, setLeavesView, useLeavesView } from './view-store';

// LST-03: FullCalendar (~60 kB gzip) loads only when the Calendar view opens.
const LeavesCalendar = lazy(() =>
  import('./LeavesCalendar').then((m) => ({ default: m.LeavesCalendar })),
);

const toggleClass = (active: boolean) =>
  `px-3 py-1 ${active ? 'bg-slate-800 text-white' : 'bg-white text-slate-800 hover:bg-slate-100'}`;

function ViewToggle() {
  const { t } = useTranslation();
  const view = useLeavesView();
  const button = (value: LeavesView, label: string) => (
    <button
      type="button"
      aria-pressed={view === value}
      className={toggleClass(view === value)}
      onClick={() => setLeavesView(value)}
    >
      {label}
    </button>
  );
  return (
    <div
      role="group"
      aria-label={t('leaves.view.label')}
      className="ml-auto flex overflow-hidden rounded border border-slate-800"
    >
      {button('list', t('leaves.view.list'))}
      {button('calendar', t('leaves.view.calendar'))}
    </div>
  );
}

function LeavesTable({ leaves, lang }: { leaves: LeaveDto[]; lang: Language }) {
  const { t } = useTranslation();
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="p-2">{t('leaves.table.requester')}</th>
            <th className="p-2">{t('leaves.table.days')}</th>
            <th className="p-2">{t('leaves.table.type')}</th>
            <th className="p-2">{t('leaves.table.state')}</th>
            <th className="p-2">{t('leaves.table.approver')}</th>
            {/* Actions (no header): LV-03 Delete, APR-02 Approve / Reject. */}
            <th className="p-2" />
          </tr>
        </thead>
        <tbody>
          {leaves.map((leave) => (
            <tr key={leave.id} className="border-b align-top">
              <td className="p-2">
                {formatUserRefLabel(leave.requester, lang)}
              </td>
              <td className="p-2">{formatDaysCell(leave, lang)}</td>
              <td className="p-2">{t(`leaveType.${leave.type}`)}</td>
              <td className="p-2">{t(`leaveState.${leave.state}`)}</td>
              <td className="p-2">
                {leave.approver ? formatUserRefLabel(leave.approver, lang) : ''}
              </td>
              <td className="p-2">
                <div className="flex flex-wrap gap-2">
                  <LeaveDecisionButtons leave={leave} />
                  <DeleteLeaveAction leave={leave} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * LST-01 `/leaves`: all leaves of all users with List | Calendar toggle.
 * LST-02 filters (toolbar) apply to both views.
 */
export function LeavesPage() {
  const { t } = useTranslation();
  const lang = currentLanguage();
  const view = useLeavesView();
  const leaves = useQuery({
    queryKey: LEAVES_KEY,
    queryFn: () => api<LeaveDto[]>('/leaves'),
  });
  const data = leaves.data;
  const filter = useLeavesFilter();
  const filtered = useMemo(
    () => (data ? filterLeaves(data, filter) : undefined),
    [data, filter],
  );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t('leaves.list.title')}</h1>
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to="/leaves/new"
          className="rounded bg-slate-800 px-3 py-1 text-white hover:bg-slate-700"
        >
          {t('leaves.list.add')}
        </Link>
        <LeavesFilters leaves={data} disabled={leaves.isPending} />
        <ViewToggle />
      </div>
      {/* The calendar (LST-03) shows its own loading overlay and alert. */}
      {view === 'list' && leaves.isPending && (
        <Spinner label={t('leaves.list.loading')} />
      )}
      {/* A failed background refetch keeps the last data below the alert. */}
      {view === 'list' && leaves.isError && (
        <LoadError
          message={t('leaves.list.loadError')}
          retrying={leaves.isFetching}
          onRetry={() => void leaves.refetch()}
        />
      )}
      {view === 'calendar' ? (
        <Suspense fallback={<Spinner label={t('leaves.list.loading')} />}>
          <LeavesCalendar
            leaves={filtered}
            loading={leaves.isPending}
            error={leaves.isError}
            retrying={leaves.isFetching}
            onRetry={() => void leaves.refetch()}
          />
        </Suspense>
      ) : (
        data &&
        filtered &&
        (data.length === 0 ? (
          <p>{t('leaves.list.empty')}</p>
        ) : filtered.length === 0 ? (
          <p>
            {t('leaves.filter.noMatch')}{' '}
            <button
              type="button"
              className="text-blue-700 underline hover:text-blue-900"
              onClick={clearLeavesFilter}
            >
              {t('leaves.filter.clear')}
            </button>
          </p>
        ) : (
          <LeavesTable leaves={filtered} lang={lang} />
        ))
      )}
    </div>
  );
}
