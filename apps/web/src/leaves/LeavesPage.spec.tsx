import type { LeaveDto } from '@leaves/shared/dto';
import { LeaveState, LeaveType } from '@leaves/shared/leaves';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setLanguage } from '../i18n';
import { renderApp } from '../test/render-app';
import { error, loggedIn, server } from '../test/server';
import { resetLeavesView } from './view-store';

afterEach(() => {
  resetLeavesView();
});

const jana = {
  id: 'u-jana',
  firstName: 'Jana',
  surname: 'Nová',
  active: true,
  anonymized: false,
};
const peter = { ...jana, id: 'u-peter', firstName: 'Peter', surname: 'Admin' };

function leaveDto(overrides: Partial<LeaveDto> = {}): LeaveDto {
  return {
    id: 'L1',
    requester: jana,
    approver: null,
    startDate: '2026-12-21',
    endDate: '2026-12-23',
    isHalfDay: false,
    type: LeaveType.ANNUAL,
    state: LeaveState.PENDING,
    numDays: 3,
    createdAt: '2026-11-04T09:12:00.000Z',
    updatedAt: '2026-11-04T09:12:00.000Z',
    ...overrides,
  };
}

const leavesApi = (leaves: LeaveDto[]) =>
  http.get('*/api/leaves', ({ request }) =>
    new URL(request.url).searchParams.has('state')
      ? HttpResponse.json([])
      : HttpResponse.json(leaves),
  );

/** Rows of the leaves table as cell texts (header excluded). */
async function rows(): Promise<string[][]> {
  const table = await screen.findByRole('table');
  return within(table)
    .getAllByRole('row')
    .slice(1)
    .map((row) =>
      within(row)
        .getAllByRole('cell')
        .map((cell) => cell.textContent ?? ''),
    );
}

describe('/leaves list (LST-01)', () => {
  it("shows every user's leaves with requester, days, type, state and approver", async () => {
    server.use(
      loggedIn(),
      leavesApi([
        leaveDto({
          id: 'L1',
          requester: { ...jana, id: 'u-b', firstName: 'Boris', surname: 'B' },
          approver: peter,
          state: LeaveState.APPROVED,
          type: LeaveType.DOCTOR,
          startDate: '2026-03-01',
          endDate: '2026-03-03',
        }),
        leaveDto({
          id: 'L2',
          startDate: '2026-01-10',
          endDate: '2026-01-12',
          numDays: 1,
        }),
        leaveDto({
          id: 'L3',
          state: LeaveState.REJECTED,
          approver: peter,
          type: LeaveType.SICKNESS,
          startDate: '2025-12-30',
          endDate: '2025-12-30',
          numDays: 1,
        }),
      ]),
    );
    renderApp('/leaves');
    expect(
      await screen.findByRole('heading', { name: 'Annual / Sick leaves' }),
    ).toBeInTheDocument();
    const headers = within(await screen.findByRole('table'))
      .getAllByRole('columnheader')
      .map((h) => h.textContent);
    expect(headers).toEqual([
      'Requester',
      'Days',
      'Type',
      'State',
      'Approver',
      '',
    ]);
    // The API order (startDate descending) is kept.
    expect(await rows()).toEqual([
      [
        'Boris B',
        'Mar 1, 2026 - Mar 3, 2026 (3 work days)',
        'Doctor visit',
        'Approved',
        'Peter Admin',
        '',
      ],
      [
        'Jana Nová',
        'Jan 10, 2026 - Jan 12, 2026 (1 work day)',
        'Annual leave',
        'Pending',
        '',
        '',
      ],
      [
        'Jana Nová',
        'Dec 30, 2025 - Dec 30, 2025 (1 work day)',
        'Sick leave',
        'Rejected',
        'Peter Admin',
        '',
      ],
    ]);
  });

  it('shows deactivated and missing users, 0 and 0.5 work days', async () => {
    server.use(
      loggedIn(),
      leavesApi([
        leaveDto({ id: 'L1', requester: { ...jana, active: false } }),
        leaveDto({
          id: 'L2',
          requester: {
            id: 'ghost',
            firstName: 'Deleted',
            surname: 'ghost',
            active: false,
            anonymized: false,
          },
          startDate: '2026-11-07',
          endDate: '2026-11-08',
          numDays: 0,
        }),
        leaveDto({
          id: 'L3',
          startDate: '2026-11-04',
          endDate: '2026-11-04',
          isHalfDay: true,
          numDays: 0.5,
        }),
      ]),
    );
    renderApp('/leaves');
    const [deactivated, ghost, half] = await rows();
    expect(deactivated![0]).toBe('Jana Nová (deactivated)');
    expect(ghost![0]).toBe('Deleted ghost');
    expect(ghost![1]).toBe('Nov 7, 2026 - Nov 8, 2026 (0 work days)');
    expect(half![1]).toBe('Nov 4, 2026 - Nov 4, 2026 (0.5 work days)');
  });

  it('shows an anonymized requester / approver under the placeholder name (NFR-08)', async () => {
    const anonymized = {
      id: 'u-peter',
      firstName: 'Anonymized',
      surname: 'User 3f9a1c2b',
      active: false,
      anonymized: true,
    };
    server.use(
      loggedIn(),
      leavesApi([
        leaveDto({
          id: 'L1',
          requester: anonymized,
          approver: anonymized,
          state: LeaveState.APPROVED,
        }),
      ]),
    );
    renderApp('/leaves');
    const [row] = await rows();
    expect(row![0]).toBe('Anonymized User 3f9a1c2b (deactivated)');
    expect(row).toContain('Anonymized User 3f9a1c2b (deactivated)');
    expect(row!.filter((c) => c.includes('Anonymized User'))).toHaveLength(2);
  });

  it('renders SK labels, dates and numbers', async () => {
    await setLanguage('sk');
    server.use(
      loggedIn(),
      leavesApi([
        leaveDto({
          requester: { ...jana, active: false },
          startDate: '2026-11-04',
          endDate: '2026-11-04',
          isHalfDay: true,
          numDays: 0.5,
          type: LeaveType.CARING,
        }),
      ]),
    );
    renderApp('/leaves');
    expect(
      await screen.findByRole('heading', { name: 'Dovolenky / PN' }),
    ).toBeInTheDocument();
    expect((await rows())[0]).toEqual([
      'Jana Nová (deaktivovaný)',
      '4. 11. 2026 – 4. 11. 2026 (0,5 pracovného dňa)',
      'Ošetrovanie člena rodiny (OČR)',
      'Čaká na schválenie',
      '',
      '',
    ]);
  });

  it('links Add to /leaves/new', async () => {
    server.use(loggedIn());
    const { router } = renderApp('/leaves');
    await userEvent.click(await screen.findByRole('link', { name: 'Add' }));
    expect(router.state.location.pathname).toBe('/leaves/new');
  });

  it('shows the spinner while loading', async () => {
    server.use(
      loggedIn(),
      http.get('*/api/leaves', async () => {
        await delay(200);
        return HttpResponse.json([leaveDto()]);
      }),
    );
    renderApp('/leaves');
    expect(
      (await screen.findByText('Loading leaves…')).closest('[role=status]'),
    ).not.toBeNull();
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.queryByText('Loading leaves…')).not.toBeInTheDocument();
  });

  it('shows "No leaves yet." when there are none', async () => {
    server.use(loggedIn(), leavesApi([]));
    renderApp('/leaves');
    expect(await screen.findByText('No leaves yet.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows the error alert with Retry; Retry refetches', async () => {
    let fail = true;
    let calls = 0;
    server.use(
      loggedIn(),
      http.get('*/api/leaves', () => {
        calls++;
        return fail
          ? error(500, 'INTERNAL_ERROR')
          : HttpResponse.json([leaveDto()]);
      }),
    );
    renderApp('/leaves');
    const alert = await screen.findByRole(
      'alert',
      {},
      { timeout: 4000 }, // the query client retries a 5xx once
    );
    expect(alert).toHaveTextContent('Could not load leaves.');
    fail = false;
    const before = calls;
    await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(calls).toBe(before + 1);
    await waitFor(() =>
      expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
    );
  });

  it('keeps the last data when a background refetch fails', async () => {
    let fail = false;
    server.use(
      loggedIn(),
      http.get('*/api/leaves', () =>
        fail ? error(500, 'INTERNAL_ERROR') : HttpResponse.json([leaveDto()]),
      ),
    );
    const { queryClient } = renderApp('/leaves');
    await screen.findByRole('table');
    fail = true;
    await act(() =>
      queryClient.refetchQueries({ queryKey: ['leaves'] }).catch(() => {}),
    );
    expect(
      await screen.findByRole('alert', {}, { timeout: 4000 }),
    ).toHaveTextContent('Could not load leaves.');
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('keeps the Calendar view across navigation; List is the default', async () => {
    server.use(loggedIn(), leavesApi([leaveDto()]));
    const { router } = renderApp('/leaves');
    const list = await screen.findByRole('button', { name: 'List' });
    const calendar = screen.getByRole('button', { name: 'Calendar' });
    expect(list).toHaveAttribute('aria-pressed', 'true');
    expect(calendar).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(calendar);
    expect(await screen.findByTestId('leaves-calendar')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    await act(() => router.navigate('/summary'));
    await screen.findByRole('heading', { name: 'Leave summary' });
    await act(() => router.navigate('/leaves'));
    expect(
      await screen.findByRole('button', { name: 'Calendar' }),
    ).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(screen.getByRole('button', { name: 'List' }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });
});

describe('leaves view store', () => {
  it('starts with List after a reload (fresh module)', async () => {
    const { setLeavesView } = await import('./view-store');
    setLeavesView('calendar');
    vi.resetModules();
    const fresh = await import('./view-store');
    const { renderHook } = await import('@testing-library/react');
    const { result } = renderHook(() => fresh.useLeavesView());
    expect(result.current).toBe('list');
  });
});
