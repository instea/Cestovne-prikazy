import type { LeaveDto, UserRefDto } from '@leaves/shared/dto';
import { formatUserRef } from '@leaves/shared/users';
import { currentLanguage, i18n, type Language } from '../i18n';
import { formatDate } from '../i18n/format';

/**
 * LST-01 Days cell: `<start> - <end> (<n> work day(s))`, dates per locale,
 * `n` with up to one decimal (`0.5` / `0,5`); 0 shows `0`, never `?`.
 */
export function formatDaysCell(
  leave: Pick<LeaveDto, 'startDate' | 'endDate' | 'numDays'>,
  lang: Language = currentLanguage(),
): string {
  return i18n.t('leaves.table.daysValue', {
    start: formatDate(leave.startDate, lang),
    end: formatDate(leave.endDate, lang),
    count: leave.numDays,
    lng: lang,
  });
}

/**
 * Requester / approver display name: `Jana Nová`, `Jana Nová (deactivated)`
 * or `Deleted <id>` for a missing user, with translated suffix / prefix.
 */
export function formatUserRefLabel(
  ref: UserRefDto | null,
  lang: Language = currentLanguage(),
): string {
  return formatUserRef(ref, {
    deactivatedSuffix: i18n.t('leaves.user.deactivated', { lng: lang }),
    deletedPrefix: i18n.t('leaves.user.deleted', { lng: lang }),
  });
}
