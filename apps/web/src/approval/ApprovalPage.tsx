import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { currentLanguage } from '../i18n';
import { pendingLeavesQuery } from '../layout/pending-leaves';
import { LeaveDecisionButtons } from '../leaves/LeaveDecisionButtons';
import { formatDaysCell, formatUserRefLabel } from '../leaves/leave-format';
import { LoadError } from '../ui/LoadError';
import { Spinner } from '../ui/Spinner';

/**
 * APR-02 `/approval` (admin only, behind RequireAdmin): every PENDING leave,
 * the admin's own included, in the API order (LST-01: startDate desc,
 * createdAt desc, id). Shares its query with the nav pending badge, so an
 * approve / reject refetch removes the row and lowers the badge together.
 * Refetched on every open and window focus (no polling).
 */
export function ApprovalPage() {
  const { t } = useTranslation();
  const lang = currentLanguage();
  const pending = useQuery({
    ...pendingLeavesQuery,
    // Every open of /approval fetches fresh data, also within the global
    // staleTime (user decision 2026-11-11).
    refetchOnMount: 'always',
  });
  const data = pending.data;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t('approval.title')}</h1>
      {pending.isPending && <Spinner label={t('leaves.list.loading')} />}
      {/* A failed background refetch keeps the last data below the alert. */}
      {pending.isError && (
        <LoadError
          message={t('leaves.list.loadError')}
          retrying={pending.isFetching}
          onRetry={() => void pending.refetch()}
        />
      )}
      {data &&
        (data.length === 0 ? (
          <p>{t('approval.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="p-2">{t('leaves.table.requester')}</th>
                  <th className="p-2">{t('leaves.table.days')}</th>
                  <th className="p-2">{t('leaves.table.type')}</th>
                  <th className="p-2">{t('leaves.table.state')}</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {data.map((leave) => (
                  <tr key={leave.id} className="border-b align-top">
                    <td className="p-2">
                      {formatUserRefLabel(leave.requester, lang)}
                    </td>
                    <td className="p-2">{formatDaysCell(leave, lang)}</td>
                    <td className="p-2">{t(`leaveType.${leave.type}`)}</td>
                    <td className="p-2">{t(`leaveState.${leave.state}`)}</td>
                    <td className="p-2">
                      <div className="flex flex-wrap gap-2">
                        <LeaveDecisionButtons leave={leave} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </div>
  );
}
