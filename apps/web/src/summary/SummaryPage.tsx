import type { LeaveSummaryDto } from '@leaves/shared/dto';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { currentLanguage } from '../i18n';
import { formatNumber } from '../i18n/format';
import { LEAVE_SUMMARY_KEY } from '../layout/query-keys';
import { LoadError } from '../ui/LoadError';
import { Spinner } from '../ui/Spinner';

/**
 * SUM-01 `/summary`: work days of the caller's APPROVED leaves per year
 * (descending) and type. The query key starts with `'leaves'`, so leave
 * create / delete / approve / reject invalidate it; reopening the page
 * always refetches.
 */
export function SummaryPage() {
  const { t } = useTranslation();
  const lang = currentLanguage();
  const summary = useQuery({
    queryKey: LEAVE_SUMMARY_KEY,
    queryFn: () => api<LeaveSummaryDto>('/leaves/summary'),
    // Every open of /summary fetches fresh data, also within the global
    // staleTime (user decision 2026-11-11).
    refetchOnMount: 'always',
  });
  const years = summary.data?.years;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t('summary.title')}</h1>
      {summary.isPending && <Spinner label={t('common.loading')} />}
      {summary.isError && (
        <LoadError
          message={t('summary.loadError')}
          retrying={summary.isFetching}
          onRetry={() => void summary.refetch()}
        />
      )}
      {years?.length === 0 && <p>{t('summary.empty')}</p>}
      {years?.map(({ year, byType }) => (
        <section
          key={year}
          aria-labelledby={`summary-${year}`}
          className="space-y-2"
        >
          <h2 id={`summary-${year}`} className="text-xl font-semibold">
            {year}
          </h2>
          {byType.length === 0 ? (
            <p>{t('summary.emptyYear')}</p>
          ) : (
            <table className="text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="p-2">{t('summary.tableType')}</th>
                  <th className="p-2">{t('summary.tableWorkDays')}</th>
                </tr>
              </thead>
              <tbody>
                {byType.map(({ type, workDays }) => (
                  <tr key={type} className="border-b">
                    <td className="p-2">{t(`leaveType.${type}`)}</td>
                    <td className="p-2">{formatNumber(workDays, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ))}
    </div>
  );
}
