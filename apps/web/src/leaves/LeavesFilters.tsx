import type { LeaveDto } from '@leaves/shared/dto';
import {
  makeMonthOptions,
  makeRequesterOptions,
  makeYearOptions,
} from '@leaves/shared/filters';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { currentLanguage } from '../i18n';
import { monthName } from '../i18n/format';
import {
  clearLeavesFilter,
  rememberRequesterLabels,
  requesterLabel,
  setLeavesFilter,
  useLeavesFilter,
} from './filter-store';
import { formatUserRefLabel } from './leave-format';
import { MultiSelect } from './MultiSelect';

const NO_LEAVES: LeaveDto[] = [];

/**
 * LST-02 toolbar filters of `/leaves` (both views): Requester, Month and
 * Year multiselects plus "Clear filter". Options are derived from the loaded
 * leaves; disabled while the first fetch runs.
 */
export function LeavesFilters({
  leaves = NO_LEAVES,
  disabled = false,
}: {
  leaves?: LeaveDto[];
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const lang = currentLanguage();
  const filter = useLeavesFilter();

  const requesters = useMemo(() => {
    const options = makeRequesterOptions(leaves, {
      label: (requester) => formatUserRefLabel(requester, lang),
      locale: lang,
    });
    // A selected requester who later vanishes from the data keeps this name.
    rememberRequesterLabels(options);
    return options;
  }, [leaves, lang]);
  const months = useMemo(
    () =>
      makeMonthOptions().map(({ id }) => ({
        id,
        label: monthName(id + 1, lang),
      })),
    [lang],
  );
  // The browser-local current year is always offered.
  const currentYear = new Date().getFullYear();
  const years = useMemo(
    () =>
      makeYearOptions(leaves, currentYear).map(({ id }) => ({
        id,
        label: String(id),
      })),
    [leaves, currentYear],
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <MultiSelect
        label={t('leaves.filter.requester')}
        options={requesters}
        selected={filter.requesterIds}
        onChange={(requesterIds) => setLeavesFilter({ requesterIds })}
        missingLabel={requesterLabel}
        disabled={disabled}
      />
      <MultiSelect
        label={t('leaves.filter.month')}
        options={months}
        selected={filter.months}
        onChange={(selected) => setLeavesFilter({ months: selected })}
        disabled={disabled}
      />
      <MultiSelect
        label={t('leaves.filter.year')}
        options={years}
        selected={filter.years}
        onChange={(selected) => setLeavesFilter({ years: selected })}
        disabled={disabled}
      />
      <button
        type="button"
        className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled}
        onClick={clearLeavesFilter}
      >
        {t('leaves.filter.clear')}
      </button>
    </div>
  );
}
