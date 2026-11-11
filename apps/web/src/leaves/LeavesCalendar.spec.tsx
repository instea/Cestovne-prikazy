import { addDays } from '@leaves/shared/calendar';
import type { LeaveDto, UserRefDto } from '@leaves/shared/dto';
import { LeaveState, LeaveType } from '@leaves/shared/leaves';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLanguage } from '../i18n';
import { renderApp } from '../test/render-app';
import { loggedIn, server } from '../test/server';
import { clearLeavesFilter } from './filter-store';
import { LeavesCalendar, type LeavesCalendarProps } from './LeavesCalendar';
import { resetLeavesView, setLeavesView } from './view-store';

const CELL_WIDTH = 100;

beforeEach(() => {
  // Only Date is faked: "today" is a browser-local 15 December 2026.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 11, 15, 12, 0));
  // jsdom has no layout: give every day cell a column-based box so that
  // FullCalendar computes real event widths (see `eventDays`).
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      const cell = this.closest('td.fc-daygrid-day');
      const col = cell ? [...cell.parentElement!.children].indexOf(cell) : 0;
      const left = col * CELL_WIDTH;
      return DOMRect.fromRect({ x: left, y: 0, width: CELL_WIDTH, height: 20 });
    },
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  clearLeavesFilter();
  resetLeavesView();
});

const user = (
  id: string,
  firstName: string,
  surname: string,
  active = true,
): UserRefDto => ({ id, firstName, surname, active, anonymized: false });
const jana = user('user-2', 'Jana', 'Nová');
const boris = user('u-boris', 'Boris', 'Biely');
const peter = user('u-peter', 'Peter', 'Starý', false);

function leaveDto(overrides: Partial<LeaveDto> = {}): LeaveDto {
  return {
    id: 'L1',
    requester: jana,
    approver: null,
    startDate: '2026-12-21',
    endDate: '2026-12-23',
    isHalfDay: false,
    type: LeaveType.ANNUAL,
    state: LeaveState.APPROVED,
    numDays: 3,
    createdAt: '2026-11-04T09:12:00.000Z',
    updatedAt: '2026-11-04T09:12:00.000Z',
    ...overrides,
  };
}

function renderCalendar(props: Partial<LeavesCalendarProps> = {}) {
  const onRetry = vi.fn();
  const view = render(
    <LeavesCalendar
      leaves={[]}
      loading={false}
      error={false}
      retrying={false}
      onRetry={onRetry}
      {...props}
    />,
  );
  return { ...view, onRetry };
}

const calendarEl = () => screen.getByTestId('leaves-calendar');
const title = () =>
  calendarEl().querySelector('.fc-toolbar-title')?.textContent ?? '';
const fcButton = (name: 'prev' | 'next' | 'today') =>
  calendarEl().querySelector<HTMLButtonElement>(`.fc-${name}-button`)!;

/** Rendered event elements (`a.fc-event`) whose title is `text`. */
function eventEls(text: string): HTMLElement[] {
  return [
    ...calendarEl().querySelectorAll<HTMLElement>('.fc-event-title'),
  ].flatMap((el) =>
    el.textContent === text ? [el.closest<HTMLElement>('.fc-event')!] : [],
  );
}

/**
 * Days an event covers in the grid: each week segment starts in the cell of
 * its first day and is widened by FullCalendar with a negative `right` of
 * (days - 1) cell widths.
 */
function eventDays(text: string): string[] {
  return eventEls(text).flatMap((event) => {
    const harness = event.closest<HTMLElement>('.fc-daygrid-event-harness')!;
    const start = harness.closest('td')!.getAttribute('data-date')!;
    const extra = Math.round(-parseFloat(harness.style.right || '0') / 100);
    return Array.from({ length: extra + 1 }, (_, i) => addDays(start, i));
  });
}

/** Page: switch to Calendar and wait for the lazily loaded component. */
async function openCalendar() {
  await userEvent.click(screen.getByRole('button', { name: 'Calendar' }));
  await screen.findByTestId('leaves-calendar');
}

const weekdayHeaders = () =>
  [...calendarEl().querySelectorAll('th.fc-col-header-cell')].map(
    (th) => th.textContent,
  );

describe('LeavesCalendar (LST-03)', () => {
  it('shows an APPROVED range on 21–23 Dec, not on the 24th, opaque', async () => {
    renderCalendar({ leaves: [leaveDto()] });
    expect(title()).toBe('December 2026');
    await waitFor(() =>
      expect(eventDays('Jana Nová (A)')).toEqual([
        '2026-12-21',
        '2026-12-22',
        '2026-12-23',
      ]),
    );
    const [event] = eventEls('Jana Nová (A)');
    expect(event).toHaveStyle({ backgroundColor: 'rgb(210, 198, 190)' });
    expect(event).toHaveStyle({ borderColor: 'rgb(210, 198, 190)' });
  });

  it('splits a range at week boundaries and ends on the last leave day', async () => {
    // Fri 25 Dec → Tue 29 Dec; EN weeks start on Sunday.
    renderCalendar({
      leaves: [leaveDto({ startDate: '2026-12-25', endDate: '2026-12-29' })],
    });
    await waitFor(() =>
      expect(eventDays('Jana Nová (A)')).toEqual([
        '2026-12-25',
        '2026-12-26',
        '2026-12-27',
        '2026-12-28',
        '2026-12-29',
      ]),
    );
    expect(eventEls('Jana Nová (A)')).toHaveLength(2);
  });

  it('shows a range ending on 31 Dec through the year end', async () => {
    renderCalendar({
      leaves: [leaveDto({ startDate: '2026-12-30', endDate: '2026-12-31' })],
    });
    await waitFor(() =>
      expect(eventDays('Jana Nová (A)')).toEqual(['2026-12-30', '2026-12-31']),
    );
  });

  it('draws a PENDING half-day DOCTOR leave as `1/2 (D)` with alpha 0.5', () => {
    renderCalendar({
      leaves: [
        leaveDto({
          startDate: '2026-12-10',
          endDate: '2026-12-10',
          isHalfDay: true,
          type: LeaveType.DOCTOR,
          state: LeaveState.PENDING,
        }),
      ],
    });
    const [event] = eventEls('Jana Nová 1/2 (D)');
    expect(event!.closest('td')).toHaveAttribute('data-date', '2026-12-10');
    expect(event).toHaveStyle({
      backgroundColor: 'rgba(210, 198, 190, 0.5)',
    });
  });

  it('hides REJECTED leaves', () => {
    renderCalendar({
      leaves: [
        leaveDto({ id: 'r', state: LeaveState.REJECTED, requester: boris }),
        leaveDto({ id: 'a' }),
      ],
    });
    expect(eventEls('Boris Biely (A)')).toHaveLength(0);
    expect(eventEls('Jana Nová (A)')).toHaveLength(1);
    expect(screen.queryByText('No leaves to show.')).not.toBeInTheDocument();
  });

  it('keeps a user’s colour whatever else is shown (user-2 → rgb(210,198,190))', () => {
    const own = leaveDto({ id: 'own' });
    const others = [
      leaveDto({ id: 'b', requester: boris, startDate: '2026-12-01' }),
      leaveDto({ id: 'p', requester: peter, startDate: '2026-12-02' }),
    ];
    const first = renderCalendar({ leaves: [...others, own] });
    const colour = eventEls('Jana Nová (A)')[0]!.style.backgroundColor;
    first.unmount();
    renderCalendar({ leaves: [own] });
    expect(eventEls('Jana Nová (A)')[0]!.style.backgroundColor).toBe(colour);
    expect(colour).toBe('rgb(210, 198, 190)');
  });

  it('shows the deactivated suffix in the title', () => {
    renderCalendar({
      leaves: [leaveDto({ requester: peter, type: LeaveType.SICKNESS })],
    });
    expect(eventEls('Peter Starý (deactivated) (S)')).toHaveLength(1);
  });

  it('navigates with prev / next / today', async () => {
    renderCalendar({ leaves: [leaveDto()] });
    expect(fcButton('today')).toBeDisabled();
    await userEvent.click(fcButton('next'));
    expect(title()).toBe('January 2027');
    expect(eventEls('Jana Nová (A)')).toHaveLength(0);
    expect(fcButton('today')).toBeEnabled();
    await userEvent.click(fcButton('today'));
    expect(title()).toBe('December 2026');
    await userEvent.click(fcButton('prev'));
    expect(title()).toBe('November 2026');
  });

  it('does nothing when an event is clicked', async () => {
    renderCalendar({ leaves: [leaveDto()] });
    const before = calendarEl().innerHTML;
    await userEvent.click(eventEls('Jana Nová (A)')[0]!);
    expect(eventEls('Jana Nová (A)')[0]).not.toHaveAttribute('href');
    expect(calendarEl().innerHTML).toBe(before);
  });

  it('EN: English toolbar, weeks start on Sunday', () => {
    renderCalendar();
    expect(fcButton('today')).toHaveTextContent('today');
    expect(weekdayHeaders()[0]).toBe('Sun');
    expect(weekdayHeaders()[6]).toBe('Sat');
  });

  it('SK: Slovak toolbar, weeks start on Monday, same type letters', async () => {
    await setLanguage('sk');
    renderCalendar({
      leaves: [
        leaveDto({ requester: peter }),
        leaveDto({
          id: 'L2',
          startDate: '2026-12-10',
          endDate: '2026-12-10',
          isHalfDay: true,
          type: LeaveType.CARING,
        }),
      ],
    });
    expect(fcButton('today')).toHaveTextContent('Dnes');
    expect(title()).toMatch(/december 2026/i);
    expect(weekdayHeaders()[0]).toMatch(/^po/i);
    expect(weekdayHeaders()[6]).toMatch(/^ne/i);
    expect(eventEls('Peter Starý (deaktivovaný) (A)')).toHaveLength(1);
    expect(eventEls('Jana Nová 1/2 (C)')).toHaveLength(1);
  });

  it('loading: renders the grid under a "Loading leaves…" overlay', () => {
    renderCalendar({ leaves: undefined, loading: true });
    expect(screen.getByRole('status')).toHaveTextContent('Loading leaves…');
    expect(title()).toBe('December 2026');
    expect(screen.queryByText('No leaves to show.')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('error: alert above the calendar with a working Retry', async () => {
    const { onRetry } = renderCalendar({ leaves: undefined, error: true });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Could not load leaves.');
    expect(
      alert.compareDocumentPosition(calendarEl()) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryByText('No leaves to show.')).not.toBeInTheDocument();
    await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('error after a refetch keeps the last events; Retry is disabled while retrying', () => {
    renderCalendar({ leaves: [leaveDto()], error: true, retrying: true });
    expect(screen.getByRole('button', { name: 'Retry' })).toBeDisabled();
    expect(eventEls('Jana Nová (A)')).toHaveLength(1);
  });

  it('empty: info line, calendar still rendered and navigable', async () => {
    renderCalendar({ leaves: [leaveDto({ state: LeaveState.REJECTED })] });
    expect(screen.getByText('No leaves to show.')).toBeInTheDocument();
    await userEvent.click(fcButton('next'));
    expect(title()).toBe('January 2027');
  });

  it('starts at the browser-local today, also late in the evening', () => {
    vi.setSystemTime(new Date(2026, 11, 31, 23, 30));
    const first = renderCalendar();
    expect(title()).toBe('December 2026');
    first.unmount();
    vi.setSystemTime(new Date(2027, 0, 1, 0, 30));
    renderCalendar();
    expect(title()).toBe('January 2027');
  });
});

describe('/leaves Calendar view (LST-03 with LST-01 / LST-02)', () => {
  const LEAVES = [
    leaveDto({ id: 'jana-ok' }),
    leaveDto({
      id: 'boris-ok',
      requester: boris,
      startDate: '2026-12-07',
      endDate: '2026-12-08',
      type: LeaveType.SICKNESS,
    }),
    leaveDto({
      id: 'boris-rejected',
      requester: boris,
      startDate: '2026-12-14',
      endDate: '2026-12-14',
      type: LeaveType.DOCTOR,
      state: LeaveState.REJECTED,
    }),
  ];
  const leavesApi = (get: () => LeaveDto[] | Promise<LeaveDto[]>) =>
    http.get('*/api/leaves', async ({ request }) =>
      new URL(request.url).searchParams.has('state')
        ? HttpResponse.json([])
        : HttpResponse.json(await get()),
    );

  const pick = async (name: string, option: string) => {
    await userEvent.click(
      screen.getByRole('button', {
        name: new RegExp(`^${name}( \\(\\d+\\))?$`),
      }),
    );
    await userEvent.click(
      within(screen.getByRole('group', { name })).getByRole('checkbox', {
        name: option,
      }),
    );
  };

  it('shows a REJECTED leave in the list but not in the calendar', async () => {
    server.use(
      loggedIn(),
      leavesApi(() => LEAVES),
    );
    renderApp('/leaves');
    const table = await screen.findByRole('table');
    expect(within(table).getByText('Rejected')).toBeInTheDocument();
    await openCalendar();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(eventEls('Jana Nová (A)')).toHaveLength(1);
    expect(eventEls('Boris Biely (S)')).toHaveLength(1);
    expect(eventEls('Boris Biely (D)')).toHaveLength(0);
  });

  it('applies the list filter: only matching non-rejected leaves (LST-02)', async () => {
    server.use(
      loggedIn(),
      leavesApi(() => LEAVES),
    );
    renderApp('/leaves');
    await screen.findByRole('table');
    await pick('Requester', 'Boris Biely');
    await openCalendar();
    expect(eventEls('Boris Biely (S)')).toHaveLength(1);
    expect(eventEls('Boris Biely (D)')).toHaveLength(0);
    expect(eventEls('Jana Nová (A)')).toHaveLength(0);
    expect(screen.queryByText('No leaves to show.')).not.toBeInTheDocument();

    // Filter changed inside the calendar view, too.
    await pick('Requester', 'Jana Nová');
    expect(eventEls('Jana Nová (A)')).toHaveLength(1);
  });

  it('shows "No leaves to show." when the filter leaves only REJECTED ones', async () => {
    server.use(
      loggedIn(),
      leavesApi(() => LEAVES),
    );
    renderApp('/leaves');
    await screen.findByRole('table');
    await pick('Month', 'January');
    await openCalendar();
    expect(screen.getByText('No leaves to show.')).toBeInTheDocument();
    expect(title()).toBe('December 2026');
  });

  it('a user keeps the colour with and without a filter', async () => {
    server.use(
      loggedIn(),
      leavesApi(() => LEAVES),
    );
    renderApp('/leaves');
    await screen.findByRole('table');
    await openCalendar();
    const colour = eventEls('Boris Biely (S)')[0]!.style.backgroundColor;
    await pick('Requester', 'Boris Biely');
    expect(eventEls('Boris Biely (S)')[0]!.style.backgroundColor).toBe(colour);
  });

  it('shows the grid with a loading overlay during the first fetch', async () => {
    setLeavesView('calendar');
    server.use(
      loggedIn(),
      leavesApi(async () => {
        await delay(300);
        return LEAVES;
      }),
    );
    renderApp('/leaves');
    // The grid itself is rendered under the overlay (not just a fallback).
    await screen.findByTestId('leaves-calendar');
    expect(screen.getByText('Loading leaves…')).toBeInTheDocument();
    expect(title()).toBe('December 2026');
    await waitFor(() => expect(eventEls('Jana Nová (A)')).toHaveLength(1));
    expect(screen.queryByText('Loading leaves…')).not.toBeInTheDocument();
  });

  it('shows the error alert above the calendar and refetches on Retry', async () => {
    setLeavesView('calendar');
    let fail = true;
    server.use(
      loggedIn(),
      http.get('*/api/leaves', () =>
        fail
          ? HttpResponse.json(
              { statusCode: 500, code: 'INTERNAL_ERROR', message: 'x' },
              { status: 500 },
            )
          : HttpResponse.json(LEAVES),
      ),
    );
    renderApp('/leaves');
    const alert = await screen.findByRole('alert', {}, { timeout: 4000 });
    expect(alert).toHaveTextContent('Could not load leaves.');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(title()).toBe('December 2026');
    fail = false;
    await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(eventEls('Jana Nová (A)')).toHaveLength(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('starts at today again after switching to List and back', async () => {
    server.use(
      loggedIn(),
      leavesApi(() => LEAVES),
    );
    renderApp('/leaves');
    await screen.findByRole('table');
    await openCalendar();
    await userEvent.click(fcButton('next'));
    expect(title()).toBe('January 2027');
    await userEvent.click(screen.getByRole('button', { name: 'List' }));
    await screen.findByRole('table');
    await openCalendar();
    expect(title()).toBe('December 2026');
  });

  it('keeps the Calendar view across navigation', async () => {
    server.use(
      loggedIn(),
      leavesApi(() => LEAVES),
    );
    const { router } = renderApp('/leaves');
    await screen.findByRole('table');
    await openCalendar();
    await act(() => router.navigate('/summary'));
    await screen.findByRole('heading', { name: 'Leave summary' });
    await act(() => router.navigate('/leaves'));
    await waitFor(() => expect(eventEls('Jana Nová (A)')).toHaveLength(1));
  });
});
