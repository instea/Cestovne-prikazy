import type { LeaveDto } from '@leaves/shared/dto';
import { LeaveState, LeaveType } from '@leaves/shared/leaves';
import { focusManager } from '@tanstack/react-query';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setLanguage } from '../i18n';
import { sessionDto, userDto } from '../test/fixtures';
import { renderApp } from '../test/render-app';
import { error, loggedIn, server } from '../test/server';
import { dismissToast, getToasts } from '../ui/toast-store';

afterEach(async () => {
  vi.restoreAllMocks();
  for (const toast of getToasts()) dismissToast(toast.id);
  await setLanguage('en');
});

const peter = {
  id: 'u-peter',
  firstName: 'Peter',
  surname: 'Admin',
  active: true,
  anonymized: false,
};
const jana = { ...peter, id: 'u-jana', firstName: 'Jana', surname: 'Nová' };
const boris = { ...peter, id: 'u-boris', firstName: 'Boris', surname: 'B' };

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

/** The API order (startDate desc) — the page must keep it. */
const threePending = [
  leaveDto({ id: 'L-jana' }),
  leaveDto({
    id: 'L-own',
    requester: peter,
    type: LeaveType.DOCTOR,
    startDate: '2026-12-01',
    endDate: '2026-12-01',
    numDays: 1,
  }),
  leaveDto({
    id: 'L-boris',
    requester: boris,
    type: LeaveType.SICKNESS,
    startDate: '2026-11-04',
    endDate: '2026-11-04',
    isHalfDay: true,
    numDays: 0.5,
  }),
];

const asAdmin = () =>
  loggedIn(sessionDto(userDto({ ...peter, isAdmin: true })));
const asUser = () => loggedIn(sessionDto(userDto({ ...jana })));

type Decide = (
  id: string,
  decision: 'approve' | 'reject',
) => Promise<Response | undefined> | Response | undefined;

/**
 * Mutable backend: `GET /api/leaves[?state=]` and
 * `POST /api/leaves/:id/approve|reject` (default: sets the state and the
 * caller as approver, 200 LeaveDto). `onDecide` may answer instead.
 */
function backend(initial: LeaveDto[], onDecide?: Decide) {
  let leaves = [...initial];
  const calls = { pending: 0, all: 0, decisions: [] as string[] };
  const apply = (id: string, decision: 'approve' | 'reject') => {
    const state =
      decision === 'approve' ? LeaveState.APPROVED : LeaveState.REJECTED;
    leaves = leaves.map((l) =>
      l.id === id ? { ...l, state, approver: peter } : l,
    );
    return leaves.find((l) => l.id === id);
  };
  server.use(
    http.get('*/api/leaves', ({ request }) => {
      const state = new URL(request.url).searchParams.get('state');
      if (state === 'PENDING') calls.pending++;
      else calls.all++;
      return HttpResponse.json(
        state ? leaves.filter((l) => (l.state as string) === state) : leaves,
      );
    }),
    http.post('*/api/leaves/:id/:decision', async ({ params }) => {
      const id = params.id as string;
      const decision = params.decision as 'approve' | 'reject';
      calls.decisions.push(`${decision} ${id}`);
      const answer = await onDecide?.(id, decision);
      if (answer) return answer;
      const leave = apply(id, decision);
      return leave
        ? HttpResponse.json(leave)
        : error(404, 'LEAVE_NOT_FOUND', 'Leave not found');
    }),
  );
  return {
    calls,
    apply,
    remove: (id: string) => {
      leaves = leaves.filter((l) => l.id !== id);
    },
    add: (leave: LeaveDto) => {
      leaves = [leave, ...leaves];
    },
  };
}

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

async function rowOf(name: string): Promise<HTMLElement> {
  const table = await screen.findByRole('table');
  const row = within(table)
    .getAllByRole('row')
    .find((r) => r.textContent?.startsWith(name));
  if (!row) throw new Error(`no row for ${name}`);
  return row;
}

const button = (row: HTMLElement, name: string) =>
  within(row).getByRole('button', { name });

describe('/approval screen (APR-02)', () => {
  it('lists every PENDING leave (own included) in API order; badge shows 3', async () => {
    server.use(asAdmin());
    backend(threePending);
    renderApp('/approval');
    expect(
      await screen.findByRole('heading', { name: 'Leaves approval' }),
    ).toBeInTheDocument();
    const headers = within(await screen.findByRole('table'))
      .getAllByRole('columnheader')
      .map((h) => h.textContent);
    expect(headers).toEqual(['Requester', 'Days', 'Type', 'State', '']);
    expect(await rows()).toEqual([
      [
        'Jana Nová',
        'Dec 21, 2026 - Dec 23, 2026 (3 work days)',
        'Annual leave',
        'Pending',
        'ApproveReject',
      ],
      [
        'Peter Admin',
        'Dec 1, 2026 - Dec 1, 2026 (1 work day)',
        'Doctor visit',
        'Pending',
        'ApproveReject',
      ],
      [
        'Boris B',
        'Nov 4, 2026 - Nov 4, 2026 (0.5 work days)',
        'Sick leave',
        'Pending',
        'ApproveReject',
      ],
    ]);
    for (const row of [
      await rowOf('Jana'),
      await rowOf('Peter'),
      await rowOf('Boris'),
    ]) {
      expect(button(row, 'Approve')).toBeEnabled();
      expect(button(row, 'Reject')).toBeEnabled();
    }
    expect(await screen.findByLabelText('3 pending')).toHaveTextContent('3');
  });

  it('renders Slovak texts, dates and numbers', async () => {
    await setLanguage('sk');
    server.use(asAdmin());
    backend([threePending[2]!]);
    renderApp('/approval');
    expect(
      await screen.findByRole('heading', {
        name: 'Schvaľovanie neprítomností',
      }),
    ).toBeInTheDocument();
    expect(await rows()).toEqual([
      [
        'Boris B',
        '4. 11. 2026 – 4. 11. 2026 (0,5 pracovného dňa)',
        'PN (práceneschopnosť)',
        'Čaká na schválenie',
        'SchváliťZamietnuť',
      ],
    ]);
  });

  it('shows "Loading leaves…" while loading', async () => {
    server.use(
      asAdmin(),
      http.get('*/api/leaves', async () => {
        await delay('infinite');
        return HttpResponse.json([]);
      }),
    );
    renderApp('/approval');
    expect(await screen.findByText('Loading leaves…')).toBeInTheDocument();
  });

  it('shows "No pending leaves." and no badge at 0', async () => {
    server.use(asAdmin());
    const api = backend([]);
    renderApp('/approval');
    expect(await screen.findByText('No pending leaves.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
    const link = screen.getByRole('link', { name: 'Leaves approval' });
    expect(link).toHaveTextContent(/^Leaves approval$/);
    expect(screen.queryByLabelText(/pending/)).toBeNull();
    // The page and the badge share one query.
    expect(api.calls.pending).toBe(1);
  });

  it('shows "Could not load leaves." with Retry; Retry refetches', async () => {
    let fail = true;
    server.use(
      asAdmin(),
      http.get('*/api/leaves', () =>
        fail ? error(500, 'INTERNAL_ERROR') : HttpResponse.json(threePending),
      ),
    );
    renderApp('/approval');
    const alert = await screen.findByRole(
      'alert',
      {},
      { timeout: 4000 }, // the query client retries a 5xx once
    );
    expect(alert).toHaveTextContent('Could not load leaves.');
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await rows()).toHaveLength(3);
    expect(screen.queryByText('Could not load leaves.')).toBeNull();
  });

  it('Approve: both buttons disabled with spinner meanwhile, other rows usable; then row gone, toast, badge 2, list shows Approved', async () => {
    server.use(asAdmin());
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const api = backend(threePending, async (id) => {
      if (id === 'L-jana') await gate;
      return undefined;
    });
    const { router } = renderApp('/approval');
    expect(await screen.findByLabelText('3 pending')).toBeInTheDocument();

    const row = await rowOf('Jana');
    await userEvent.click(button(row, 'Approve'));
    await waitFor(() =>
      expect(api.calls.decisions).toEqual(['approve L-jana']),
    );
    expect(button(row, 'Approve')).toBeDisabled();
    expect(button(row, 'Approve')).toHaveAttribute('aria-busy', 'true');
    expect(within(row).getByTestId('decision-spinner')).toBeInTheDocument();
    expect(button(row, 'Reject')).toBeDisabled();
    // Requests are independent: another row still works meanwhile.
    const other = await rowOf('Boris');
    expect(button(other, 'Reject')).toBeEnabled();

    release();
    expect(await screen.findByText('Leave approved.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Jana Nová')).toBeNull());
    expect(await screen.findByLabelText('2 pending')).toBeInTheDocument();
    expect((await rows()).map((r) => r[0])).toEqual(['Peter Admin', 'Boris B']);

    await act(() => router.navigate('/leaves'));
    const listRow = await rowOf('Jana Nová');
    expect(within(listRow).getAllByRole('cell')[3]).toHaveTextContent(
      'Approved',
    );
    expect(within(listRow).getAllByRole('cell')[4]).toHaveTextContent(
      'Peter Admin',
    );
  });

  it('admin approves their own leave', async () => {
    server.use(asAdmin());
    const api = backend(threePending);
    renderApp('/approval');
    await userEvent.click(button(await rowOf('Peter'), 'Approve'));
    expect(await screen.findByText('Leave approved.')).toBeInTheDocument();
    await waitFor(async () =>
      expect((await rows()).map((r) => r[0])).toEqual(['Jana Nová', 'Boris B']),
    );
    expect(api.calls.decisions).toEqual(['approve L-own']);
  });

  it('Reject: row gone, toast "Leave rejected.", badge drops', async () => {
    server.use(asAdmin());
    const api = backend(threePending);
    renderApp('/approval');
    expect(await screen.findByLabelText('3 pending')).toBeInTheDocument();
    await userEvent.click(button(await rowOf('Boris'), 'Reject'));
    expect(await screen.findByText('Leave rejected.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Boris B')).toBeNull());
    expect(await screen.findByLabelText('2 pending')).toBeInTheDocument();
    expect(api.calls.decisions).toEqual(['reject L-boris']);
  });

  it('the last decision leaves "No pending leaves." and hides the badge', async () => {
    server.use(asAdmin());
    backend([threePending[0]!]);
    renderApp('/approval');
    expect(await screen.findByLabelText('1 pending')).toBeInTheDocument();
    await userEvent.click(button(await rowOf('Jana'), 'Approve'));
    expect(await screen.findByText('No pending leaves.')).toBeInTheDocument();
    expect(screen.queryByLabelText(/pending/)).toBeNull();
  });

  it('a leave deleted meanwhile → "This leave no longer exists." and the row disappears after refetch', async () => {
    server.use(asAdmin());
    const api = backend(threePending, (id) => {
      api.remove(id); // the owner deleted it meanwhile
      return error(404, 'LEAVE_NOT_FOUND', 'Leave not found');
    });
    renderApp('/approval');
    await userEvent.click(button(await rowOf('Jana'), 'Approve'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This leave no longer exists.',
    );
    await waitFor(() => expect(screen.queryByText('Jana Nová')).toBeNull());
    expect(await screen.findByLabelText('2 pending')).toBeInTheDocument();
    // Only the APR-02 toast, not the generic translated code as well.
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  it('403 → "You are not allowed to do this."; the row stays', async () => {
    server.use(asAdmin());
    backend(threePending, () => error(403, 'FORBIDDEN', 'Admin role required'));
    renderApp('/approval');
    const row = await rowOf('Jana');
    await userEvent.click(button(row, 'Reject'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You are not allowed to do this.',
    );
    expect(await rowOf('Jana')).toBeInTheDocument();
    await waitFor(() => expect(button(row, 'Reject')).toBeEnabled());
  });

  it('a network error → "Action failed. Try again."; the row stays, buttons usable again, no refetch', async () => {
    server.use(asAdmin());
    const api = backend(threePending, async () => {
      await delay(1);
      return HttpResponse.error();
    });
    renderApp('/approval');
    const row = await rowOf('Jana');
    const before = api.calls.pending;
    await userEvent.click(button(row, 'Approve'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Action failed. Try again.',
    );
    await waitFor(() => expect(button(row, 'Approve')).toBeEnabled());
    expect(button(row, 'Reject')).toBeEnabled();
    expect(within(row).queryByTestId('decision-spinner')).toBeNull();
    expect(await rowOf('Jana')).toBeInTheDocument();
    expect(api.calls.pending).toBe(before);
  });

  it('another error code → "Action failed. Try again." (SK translated)', async () => {
    await setLanguage('sk');
    server.use(asAdmin());
    backend(threePending, () => error(500, 'INTERNAL_ERROR'));
    renderApp('/approval');
    await userEvent.click(button(await rowOf('Jana'), 'Schváliť'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Akcia zlyhala. Skúste to znova.',
    );
  });

  it('invalidates the summary after a decision (SUM-01)', async () => {
    server.use(asAdmin());
    backend(threePending);
    let summaryCalls = 0;
    server.use(
      http.get('*/api/leaves/summary', () => {
        summaryCalls++;
        return HttpResponse.json({ years: [] });
      }),
    );
    const { router, queryClient } = renderApp('/summary');
    expect(await screen.findByText(/no approved leaves/i)).toBeInTheDocument();
    await act(() => router.navigate('/approval'));
    await userEvent.click(button(await rowOf('Jana'), 'Approve'));
    expect(await screen.findByText('Leave approved.')).toBeInTheDocument();
    expect(
      queryClient.getQueryState(['leaves', 'summary'])?.isInvalidated,
    ).toBe(true);
    const before = summaryCalls;
    await act(() => router.navigate('/summary'));
    await waitFor(() => expect(summaryCalls).toBe(before + 1));
  });
});

describe('nav pending badge (APR-02)', () => {
  it('a non-admin has no link and badge, and the pending query never runs', async () => {
    server.use(asUser());
    const api = backend(threePending);
    renderApp('/leaves');
    await screen.findByRole('heading', { name: 'Annual / Sick leaves' });
    await waitFor(() => expect(api.calls.all).toBe(1));
    const nav = screen.getByRole('navigation');
    expect(
      within(nav).queryByRole('link', { name: /Leaves approval/ }),
    ).toBeNull();
    expect(screen.queryByLabelText(/pending/)).toBeNull();
    expect(api.calls.pending).toBe(0);
  });

  it('a non-admin on /approval gets the not-authorized text and no API call', async () => {
    server.use(asUser());
    const api = backend(threePending);
    renderApp('/approval');
    expect(
      await screen.findByText('You are not authorized to view this page!'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(api.calls.pending).toBe(0);
  });

  it('refreshes on window focus once the count is stale (no polling)', async () => {
    server.use(asAdmin());
    const api = backend([]);
    renderApp('/leaves');
    await screen.findByRole('link', { name: 'Leaves approval' });
    await waitFor(() => expect(api.calls.pending).toBe(1));
    api.add(leaveDto({ id: 'L-new' }));
    // No refetch without focus (no polling).
    expect(screen.queryByLabelText('1 pending')).toBeNull();

    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 31_000);
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    expect(await screen.findByLabelText('1 pending')).toBeInTheDocument();
    expect(api.calls.pending).toBe(2);
    act(() => focusManager.setFocused(undefined));
  });
});
