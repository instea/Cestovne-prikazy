import type { LeaveDto, UserRefDto } from '@leaves/shared/dto';
import { LeaveState, LeaveType } from '@leaves/shared/leaves';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLanguage } from '../i18n';
import { renderApp } from '../test/render-app';
import { loggedIn, server } from '../test/server';
import { clearLeavesFilter } from './filter-store';
import { resetLeavesView } from './view-store';

beforeEach(() => {
  // Only Date is faked: the current year is 2026.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 10, 12, 0));
});

afterEach(() => {
  vi.useRealTimers();
  clearLeavesFilter();
  resetLeavesView();
});

const user = (id: string, firstName: string, surname: string): UserRefDto => ({
  id,
  firstName,
  surname,
  active: true,
  anonymized: false,
});
const jana = user('u-jana', 'Jana', 'Nová');
const boris = user('u-boris', 'Boris', 'Biely');
const xena = user('u-xena', 'Xena', 'Zelená');

function leaveDto(
  id: string,
  requester: UserRefDto,
  startDate: string,
  endDate: string,
  state: LeaveState = LeaveState.APPROVED,
): LeaveDto {
  return {
    id,
    requester,
    approver: null,
    startDate,
    endDate,
    isHalfDay: false,
    type: LeaveType.ANNUAL,
    state,
    numDays: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

// Old leaveFilter.spec fixtures plus a 2026 set.
const LEAVES = [
  leaveDto('july-x', xena, '2026-07-10', '2026-07-14'),
  leaveDto('june-aug-x', xena, '2026-06-20', '2026-08-03'),
  leaveDto('july-jana', jana, '2026-07-01', '2026-07-02'),
  leaveDto('aug-x', xena, '2026-08-10', '2026-08-11'),
  leaveDto('july25-x', xena, '2025-07-01', '2025-07-02'),
  leaveDto('crossing', boris, '2017-12-18', '2018-01-12'),
  leaveDto('two-months', boris, '2017-12-05', '2018-02-05'),
  leaveDto('one-day', jana, '2017-12-05', '2017-12-05'),
];

function leavesApi(get: () => LeaveDto[] = () => LEAVES) {
  return http.get('*/api/leaves', ({ request }) =>
    new URL(request.url).searchParams.has('state')
      ? HttpResponse.json([])
      : HttpResponse.json(get()),
  );
}

/** Fixture ids of the table rows, in display order. */
async function shownIds(): Promise<string[]> {
  const table = await screen.findByRole('table');
  return within(table).getAllByRole('row').slice(1).map(rowKey);
}

/** Matches a row back to its fixture by requester + days text. */
function rowKey(row: HTMLElement): string {
  const text = row.textContent ?? '';
  const match = LEAVES.find((l) => {
    const name = `${l.requester!.firstName} ${l.requester!.surname}`;
    const [y, m, d] = l.startDate.split('-').map(Number);
    const start = new Date(y!, m! - 1, d).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    return text.startsWith(name) && text.includes(`${start} - `);
  });
  return match?.id ?? text;
}

const filterButton = (name: string) =>
  screen.getByRole('button', { name: new RegExp(`^${name}( \\(\\d+\\))?$`) });

/** Opens the dropdown `name` and toggles the given options. */
async function pick(name: string, ...options: string[]) {
  await userEvent.click(filterButton(name));
  const panel = screen.getByRole('group', { name });
  for (const option of options)
    await userEvent.click(
      within(panel).getByRole('checkbox', { name: option }),
    );
  await userEvent.keyboard('{Escape}');
}

async function optionLabels(name: string): Promise<string[]> {
  await userEvent.click(filterButton(name));
  const panel = screen.getByRole('group', { name });
  const labels = within(panel)
    .getAllByRole('checkbox')
    .map((c) => c.closest('label')!.textContent ?? '');
  await userEvent.keyboard('{Escape}');
  return labels;
}

async function openList(get?: () => LeaveDto[]) {
  server.use(loggedIn(), leavesApi(get));
  const view = renderApp('/leaves');
  await screen.findByRole('table');
  return view;
}

describe('/leaves filters (LST-02)', () => {
  it('shows all leaves without a selection; buttons show the placeholders', async () => {
    await openList();
    expect(await shownIds()).toEqual(LEAVES.map((l) => l.id));
    expect(filterButton('Requester')).toHaveTextContent(/^Requester$/);
    expect(filterButton('Month')).toHaveTextContent(/^Month$/);
    expect(filterButton('Year')).toHaveTextContent(/^Year$/);
    expect(screen.getByRole('button', { name: 'Clear filter' })).toBeEnabled();
  });

  it('years [2018]: hides a 2017 one-day leave, shows 2017-12 → 2018-02', async () => {
    await openList();
    await pick('Year', '2018');
    expect(filterButton('Year')).toHaveTextContent('Year (1)');
    expect(await shownIds()).toEqual(['crossing', 'two-months']);
  });

  it('months [January]: shows a December → January leave', async () => {
    await openList();
    await pick('Month', 'January');
    expect(await shownIds()).toEqual(['crossing', 'two-months']);
  });

  it('requester X + July + 2026: only X’s leaves covering July 2026', async () => {
    await openList();
    await pick('Requester', 'Xena Zelená');
    await pick('Month', 'July');
    await pick('Year', '2026');
    expect(await shownIds()).toEqual(['july-x', 'june-aug-x']);
    expect(filterButton('Requester')).toHaveTextContent('Requester (1)');
    expect(filterButton('Month')).toHaveTextContent('Month (1)');
    expect(filterButton('Year')).toHaveTextContent('Year (1)');
  });

  it('Clear filter empties all three selections and shows all leaves', async () => {
    await openList();
    await pick('Requester', 'Xena Zelená');
    await pick('Month', 'July', 'August');
    await pick('Year', '2026');
    expect(filterButton('Month')).toHaveTextContent('Month (2)');
    await userEvent.click(screen.getByRole('button', { name: 'Clear filter' }));
    expect(await shownIds()).toEqual(LEAVES.map((l) => l.id));
    expect(filterButton('Requester')).toHaveTextContent(/^Requester$/);
    expect(filterButton('Month')).toHaveTextContent(/^Month$/);
    expect(filterButton('Year')).toHaveTextContent(/^Year$/);
    await userEvent.click(filterButton('Month'));
    const panel = screen.getByRole('group', { name: 'Month' });
    for (const box of within(panel).getAllByRole('checkbox'))
      expect(box).not.toBeChecked();
  });

  it('shows "No leaves match the filter." with a Clear filter link', async () => {
    await openList();
    await pick('Requester', 'Jana Nová');
    await pick('Year', '2025');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    const message = screen.getByText(/No leaves match the filter\./);
    await userEvent.click(
      within(message).getByRole('button', { name: 'Clear filter' }),
    );
    expect(await shownIds()).toEqual(LEAVES.map((l) => l.id));
  });

  it('offers requesters sorted by display name and years from start / end years plus the current year', async () => {
    await openList(() => [
      leaveDto('a', xena, '2024-03-01', '2024-03-02'),
      leaveDto('b', { ...boris, active: false }, '2024-05-01', '2024-05-01'),
      leaveDto('c', xena, '2024-06-01', '2024-06-01'),
    ]);
    expect(await optionLabels('Year')).toEqual(['2026', '2024']);
    expect(await optionLabels('Requester')).toEqual([
      'Boris Biely (deactivated)',
      'Xena Zelená',
    ]);
    expect(await optionLabels('Month')).toEqual([
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ]);
  });

  it('Check all selects every option, Uncheck all clears them', async () => {
    await openList();
    await userEvent.click(filterButton('Month'));
    const panel = screen.getByRole('group', { name: 'Month' });
    await userEvent.click(
      within(panel).getByRole('button', { name: 'Check all' }),
    );
    expect(filterButton('Month')).toHaveTextContent('Month (12)');
    for (const box of within(panel).getAllByRole('checkbox'))
      expect(box).toBeChecked();
    expect(await shownIds()).toEqual(LEAVES.map((l) => l.id));
    await userEvent.click(
      within(panel).getByRole('button', { name: 'Uncheck all' }),
    );
    expect(filterButton('Month')).toHaveTextContent(/^Month$/);
  });

  it('unchecking an option removes it; Escape and an outside click close the panel', async () => {
    await openList();
    await userEvent.click(filterButton('Year'));
    const panel = screen.getByRole('group', { name: 'Year' });
    await userEvent.click(
      within(panel).getByRole('checkbox', { name: '2018' }),
    );
    await userEvent.click(
      within(panel).getByRole('checkbox', { name: '2026' }),
    );
    expect(filterButton('Year')).toHaveTextContent('Year (2)');
    await userEvent.click(
      within(panel).getByRole('checkbox', { name: '2018' }),
    );
    expect(filterButton('Year')).toHaveTextContent('Year (1)');
    expect(filterButton('Year')).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('group', { name: 'Year' })).toBeNull();
    await userEvent.click(filterButton('Year'));
    expect(screen.getByRole('group', { name: 'Year' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('heading'));
    expect(screen.queryByRole('group', { name: 'Year' })).toBeNull();
  });

  it('keeps a selected requester that disappears from the data (matches nothing)', async () => {
    let data = LEAVES;
    const { queryClient } = await openList(() => data);
    await pick('Requester', 'Boris Biely');
    expect(await shownIds()).toEqual(['crossing', 'two-months']);
    data = LEAVES.filter((l) => l.requester!.id !== boris.id);
    await act(() => queryClient.refetchQueries({ queryKey: ['leaves'] }));
    expect(
      await screen.findByText(/No leaves match the filter\./),
    ).toBeInTheDocument();
    expect(filterButton('Requester')).toHaveTextContent('Requester (1)');
    // Still listed (by id) and checked, so it can be unchecked.
    await userEvent.click(filterButton('Requester'));
    const panel = screen.getByRole('group', { name: 'Requester' });
    expect(
      within(panel).getByRole('checkbox', { name: boris.id }),
    ).toBeChecked();
  });

  it('keeps the filter across navigation and while switching to Calendar and back', async () => {
    const { router } = await openList();
    await pick('Year', '2018');
    await act(() => router.navigate('/summary'));
    await screen.findByRole('heading', { name: 'Leave summary' });
    await act(() => router.navigate('/leaves'));
    expect(await shownIds()).toEqual(['crossing', 'two-months']);
    expect(filterButton('Year')).toHaveTextContent('Year (1)');

    await userEvent.click(screen.getByRole('button', { name: 'Calendar' }));
    // Filters stay in the toolbar of the calendar view (LST-03 renders it).
    expect(filterButton('Year')).toHaveTextContent('Year (1)');
    await userEvent.click(screen.getByRole('button', { name: 'List' }));
    expect(await shownIds()).toEqual(['crossing', 'two-months']);
  });

  it('disables the filters while the first fetch runs', async () => {
    server.use(
      loggedIn(),
      http.get('*/api/leaves', async () => {
        await delay(150);
        return HttpResponse.json(LEAVES);
      }),
    );
    renderApp('/leaves');
    await screen.findByText('Loading leaves…');
    expect(filterButton('Requester')).toBeDisabled();
    expect(filterButton('Month')).toBeDisabled();
    expect(filterButton('Year')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Clear filter' })).toBeDisabled();
    await screen.findByRole('table');
    await waitFor(() => expect(filterButton('Month')).toBeEnabled());
  });

  it('translates placeholders, month names and the empty-filter message (SK)', async () => {
    await setLanguage('sk');
    server.use(loggedIn(), leavesApi());
    renderApp('/leaves');
    await screen.findByRole('table');
    expect(filterButton('Žiadateľ')).toBeInTheDocument();
    expect(filterButton('Rok')).toBeInTheDocument();
    await userEvent.click(filterButton('Mesiac'));
    const panel = screen.getByRole('group', { name: 'Mesiac' });
    expect(
      within(panel).getByRole('button', { name: 'Označiť všetko' }),
    ).toBeInTheDocument();
    await userEvent.click(
      within(panel).getByRole('checkbox', { name: 'január' }),
    );
    await userEvent.keyboard('{Escape}');
    expect(filterButton('Mesiac')).toHaveTextContent('Mesiac (1)');
    await pick('Rok', '2025');
    expect(
      screen.getByText(/Filtru nezodpovedajú žiadne neprítomnosti\./),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: 'Zrušiť filter' }),
    ).toHaveLength(2);
  });
});

describe('leaves filter store', () => {
  it('is empty after a reload (fresh module)', async () => {
    const { setLeavesFilter } = await import('./filter-store');
    setLeavesFilter({ years: [2018] });
    vi.resetModules();
    const fresh = await import('./filter-store');
    const { renderHook } = await import('@testing-library/react');
    const { result } = renderHook(() => fresh.useLeavesFilter());
    expect(result.current).toEqual({ requesterIds: [], months: [], years: [] });
    setLeavesFilter({ years: [] });
  });
});
