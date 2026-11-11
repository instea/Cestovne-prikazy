import type { LeaveDto } from '@leaves/shared/dto';
import { LeaveState, LeaveType } from '@leaves/shared/leaves';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { ApiError } from '../api/errors';
import { sessionDto, userDto } from '../test/fixtures';
import { renderApp } from '../test/render-app';
import { error, loggedIn, server } from '../test/server';
import { dismissToast, getToasts } from '../ui/toast-store';
import { decisionErrorKey } from './leave-decision';
import { resetLeavesView } from './view-store';

afterEach(() => {
  resetLeavesView();
  for (const toast of getToasts()) dismissToast(toast.id);
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
const anna = { ...peter, id: 'u-anna', firstName: 'Anna', surname: 'C' };

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

const other = { ...peter, id: 'u-other', firstName: 'Olga', surname: 'O' };
const pendingLeave = leaveDto({ id: 'L-pending', requester: jana });
const approvedLeave = leaveDto({
  id: 'L-approved',
  requester: boris,
  state: LeaveState.APPROVED,
  approver: other,
});
const rejectedLeave = leaveDto({
  id: 'L-rejected',
  requester: anna,
  state: LeaveState.REJECTED,
  approver: other,
});
const all = [pendingLeave, approvedLeave, rejectedLeave];

const asAdmin = () =>
  loggedIn(sessionDto(userDto({ ...peter, isAdmin: true })));
const asUser = () => loggedIn(sessionDto(userDto({ ...jana })));

/** Mutable `GET /api/leaves[?state=]` + `POST /api/leaves/:id/:decision`. */
function backend(
  initial: LeaveDto[],
  onDecide?: () => Promise<Response> | Response,
) {
  let leaves = [...initial];
  const decisions: string[] = [];
  server.use(
    http.get('*/api/leaves', ({ request }) => {
      const state = new URL(request.url).searchParams.get('state');
      return HttpResponse.json(
        state ? leaves.filter((l) => (l.state as string) === state) : leaves,
      );
    }),
    http.post('*/api/leaves/:id/:decision', async ({ params }) => {
      const id = params.id as string;
      decisions.push(`${params.decision as string} ${id}`);
      if (onDecide) return onDecide();
      const state =
        params.decision === 'approve'
          ? LeaveState.APPROVED
          : LeaveState.REJECTED;
      leaves = leaves.map((l) =>
        l.id === id ? { ...l, state, approver: peter } : l,
      );
      return HttpResponse.json(leaves.find((l) => l.id === id));
    }),
  );
  return { decisions };
}

async function rowOf(name: string): Promise<HTMLElement> {
  const table = await screen.findByRole('table');
  const row = within(table)
    .getAllByRole('row')
    .find((r) => r.textContent?.startsWith(name));
  if (!row) throw new Error(`no row for ${name}`);
  return row;
}

const approveIn = (row: HTMLElement) =>
  within(row).getByRole('button', { name: 'Approve' });
const rejectIn = (row: HTMLElement) =>
  within(row).getByRole('button', { name: 'Reject' });
const cells = (row: HTMLElement) =>
  within(row)
    .getAllByRole('cell')
    .map((c) => c.textContent);

describe('decisionErrorKey (APR-02)', () => {
  it('maps LEAVE_NOT_FOUND, FORBIDDEN and everything else', () => {
    expect(decisionErrorKey(new ApiError(404, 'LEAVE_NOT_FOUND', ''))).toBe(
      'approval.notFound',
    );
    expect(decisionErrorKey(new ApiError(403, 'FORBIDDEN', ''))).toBe(
      'approval.forbidden',
    );
    expect(decisionErrorKey(new ApiError(0, 'NETWORK_ERROR', ''))).toBe(
      'approval.failed',
    );
    expect(decisionErrorKey(new ApiError(500, 'INTERNAL_ERROR', ''))).toBe(
      'approval.failed',
    );
    expect(decisionErrorKey(new Error('boom'))).toBe('approval.failed');
  });
});

describe('/leaves row Approve / Reject (APR-02)', () => {
  it('a non-admin sees no Approve / Reject on any row', async () => {
    server.use(asUser());
    backend(all);
    renderApp('/leaves');
    await rowOf('Jana');
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull();
  });

  it('an admin sees both on every row; the current-state button is disabled', async () => {
    server.use(asAdmin());
    backend(all);
    renderApp('/leaves');
    const pending = await rowOf('Jana');
    expect(approveIn(pending)).toBeEnabled();
    expect(rejectIn(pending)).toBeEnabled();
    const approved = await rowOf('Boris');
    expect(approveIn(approved)).toBeDisabled();
    expect(rejectIn(approved)).toBeEnabled();
    const rejected = await rowOf('Anna');
    expect(approveIn(rejected)).toBeEnabled();
    expect(rejectIn(rejected)).toBeDisabled();
    // Next to Delete; no action back to PENDING.
    expect(
      within(pending)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Approve', 'Reject', 'Delete']);
  });

  it('re-approves a REJECTED leave: row stays, shows Approved + admin, Approve disabled', async () => {
    server.use(asAdmin());
    const api = backend(all);
    renderApp('/leaves');
    const row = await rowOf('Anna');
    await userEvent.click(approveIn(row));
    expect(await screen.findByText('Leave approved.')).toBeInTheDocument();
    await waitFor(() => expect(cells(row)[3]).toBe('Approved'));
    expect(cells(row)[4]).toBe('Peter Admin');
    expect(approveIn(row)).toBeDisabled();
    expect(rejectIn(row)).toBeEnabled();
    expect(api.decisions).toEqual(['approve L-rejected']);
  });

  it('rejects an APPROVED leave: row shows Rejected, Reject disabled', async () => {
    server.use(asAdmin());
    const api = backend(all);
    renderApp('/leaves');
    const row = await rowOf('Boris');
    await userEvent.click(rejectIn(row));
    expect(await screen.findByText('Leave rejected.')).toBeInTheDocument();
    await waitFor(() => expect(cells(row)[3]).toBe('Rejected'));
    expect(cells(row)[4]).toBe('Peter Admin');
    expect(rejectIn(row)).toBeDisabled();
    expect(approveIn(row)).toBeEnabled();
    expect(api.decisions).toEqual(['reject L-approved']);
  });

  it('approving a PENDING leave decrements the badge; buttons disabled meanwhile', async () => {
    server.use(asAdmin());
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let leaves = [...all];
    server.use(
      http.get('*/api/leaves', ({ request }) => {
        const state = new URL(request.url).searchParams.get('state');
        return HttpResponse.json(
          state ? leaves.filter((l) => (l.state as string) === state) : leaves,
        );
      }),
      http.post('*/api/leaves/:id/approve', async () => {
        await gate;
        leaves = leaves.map((l) =>
          l.id === 'L-pending'
            ? { ...l, state: LeaveState.APPROVED, approver: peter }
            : l,
        );
        return HttpResponse.json(leaves[0]);
      }),
    );
    renderApp('/leaves');
    expect(await screen.findByLabelText('1 pending')).toBeInTheDocument();
    const row = await rowOf('Jana');
    await userEvent.click(approveIn(row));
    expect(approveIn(row)).toBeDisabled();
    expect(approveIn(row)).toHaveAttribute('aria-busy', 'true');
    expect(within(row).getByTestId('decision-spinner')).toBeInTheDocument();
    expect(rejectIn(row)).toBeDisabled();
    expect(rejectIn(await rowOf('Boris'))).toBeEnabled();
    release();
    await waitFor(() => expect(cells(row)[3]).toBe('Approved'));
    await waitFor(() => expect(screen.queryByLabelText(/pending/)).toBeNull());
    expect(within(row).queryByTestId('decision-spinner')).toBeNull();
  });

  it('errors use the approval toasts: 404 → "This leave no longer exists."', async () => {
    server.use(asAdmin());
    backend(all, () => error(404, 'LEAVE_NOT_FOUND', 'Leave not found'));
    renderApp('/leaves');
    const row = await rowOf('Jana');
    await userEvent.click(rejectIn(row));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This leave no longer exists.',
    );
  });

  it('errors use the approval toasts: network → "Action failed. Try again."; row unchanged', async () => {
    server.use(asAdmin());
    backend(all, () => HttpResponse.error());
    renderApp('/leaves');
    const row = await rowOf('Jana');
    await userEvent.click(approveIn(row));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Action failed. Try again.',
    );
    await waitFor(() => expect(approveIn(row)).toBeEnabled());
    expect(cells(row)[3]).toBe('Pending');
  });

  it('the Calendar view has no Approve / Reject', async () => {
    server.use(asAdmin());
    backend(all);
    renderApp('/leaves');
    await rowOf('Jana');
    await userEvent.click(screen.getByRole('button', { name: 'Calendar' }));
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull();
  });
});
