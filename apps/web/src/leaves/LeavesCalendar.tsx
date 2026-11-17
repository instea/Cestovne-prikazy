import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/react/daygrid';
import skLocale from '@fullcalendar/react/locales/sk';
import '@fullcalendar/react/skeleton.css';
import classicThemePlugin from '@fullcalendar/react/themes/classic';
import '@fullcalendar/react/themes/classic/palette.css';
import '@fullcalendar/react/themes/classic/theme.css';
import { toCalendarEvents } from '@leaves/shared/calendar';
import type { LeaveDto } from '@leaves/shared/dto';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { currentLanguage, type Language } from '../i18n';
import { LoadError } from '../ui/LoadError';
import { Spinner } from '../ui/Spinner';

// FullCalendar 7: plugins and the SK locale ship in `@fullcalendar/react`;
// styling is a theme plugin plus its CSS (classic = the v6 look).
const PLUGINS = [dayGridPlugin, classicThemePlugin];
const HEADER_TOOLBAR = { left: 'prev,next today', center: 'title', right: '' };

/**
 * FullCalendar locale per UI language (NFR-13): `en` is built in, SK uses
 * the bundled `sk` locale (button texts, title, weekday names). Week starts
 * on Sunday in EN (old calendar) and Monday in SK.
 */
const CALENDAR_LOCALE = {
  en: { locale: 'en', firstDay: 0 },
  sk: { locale: skLocale, firstDay: 1 },
} as const satisfies Record<Language, unknown>;

export interface LeavesCalendarProps {
  /** LST-02 filtered leaves; `undefined` until the first fetch succeeds. */
  leaves: LeaveDto[] | undefined;
  loading: boolean;
  error: boolean;
  retrying: boolean;
  onRetry: () => void;
}

/**
 * LST-03 Calendar view of `/leaves`: read-only FullCalendar month grid of the
 * filtered, non-REJECTED leaves (PENDING at 50% background alpha, colour per
 * requester). Starts at today (browser-local date); remounting (switching
 * List → Calendar) starts at today again. Clicking an event does nothing.
 */
export function LeavesCalendar({
  leaves,
  loading,
  error,
  retrying,
  onRetry,
}: LeavesCalendarProps) {
  const { t } = useTranslation();
  const lang = currentLanguage();
  const events = useMemo(
    () =>
      toCalendarEvents(leaves ?? [], {
        deactivatedSuffix: t('leaves.user.deactivated'),
        deletedPrefix: t('leaves.user.deleted'),
        halfDay: t('leaves.calendar.halfDay'),
      }),
    [leaves, t],
  );
  const { locale, firstDay } = CALENDAR_LOCALE[lang];

  return (
    <div className="space-y-3">
      {/* A failed background refetch keeps the last events below the alert. */}
      {error && (
        <LoadError
          message={t('leaves.list.loadError')}
          retrying={retrying}
          onRetry={onRetry}
        />
      )}
      {leaves && events.length === 0 && (
        <p className="text-slate-600">{t('leaves.calendar.empty')}</p>
      )}
      <div className="relative" data-testid="leaves-calendar">
        <FullCalendar
          plugins={PLUGINS}
          initialView="dayGridMonth"
          locale={locale}
          firstDay={firstDay}
          headerToolbar={HEADER_TOOLBAR}
          dayMaxEvents={false}
          editable={false}
          selectable={false}
          // Readable on the light palette and on 50% PENDING backgrounds.
          eventContrastColor="#1e293b"
          height="auto"
          events={events}
        />
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70">
            <Spinner label={t('leaves.list.loading')} />
          </div>
        )}
      </div>
    </div>
  );
}
