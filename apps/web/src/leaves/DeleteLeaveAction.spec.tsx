import type { LeaveDto } from '@leaves/shared/dto';
import { LeaveState, LeaveType } from '@leaves/shared/leaves';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../i18n';
import { sessionDto, userDto } from '../test/fixtures';
import { renderApp } from '../test/render-app';
import { error, loggedIn, server } from '../test/server';
import { dismissToast, getToasts } from '../ui/toast-store';
import { canDeleteLeave } from './leave-permissions';
import { resetLeavesView } from './view-store';

afterEach(async () => {
  resetLeavesView();
  for (const toast of getToasts()) dismissToast(toast.id);
  await setLanguage('en');
});

const me = { id: 'u-me', firstName: 'Jana', surname: 'Nová' };
const colleague = {
  id: 'u-colleague',
  firstName: 'Boris',
  surname: 'Kolega',
  active: true,
  anonymized: false,
};

function leaveDto(overrides: Partial<LeaveDto> = {}): LeaveDto {
  return {
    id: 'L-own',
    requester: { ...me, active: true, anonymized: false },
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

const own = leaveDto();
const colleagues = leaveDto({
  id: 'L-colleague',
  requester: colleague,
  type: LeaveType.DOCTOR,
  state: LeaveState.PENDING,
  startDate: '2026-12-01',
  endDate: '2026-12-01',
  numDays: 1,
});

const session = (isAdmin = false) =>
  loggedIn(sessionDto(userDto({ ...me, isAdmin })));

/**
 * `GET /api/leaves` (and `?state=PENDING`) served from a mutable list;
 * `DELETE /api/leaves/:id` answered by `onDelete` (default: removes, 204).
 */
function leavesBackend(
  initial: LeaveDto[],
  onDelete?: (id: string) => Promise<Response> | Response,
) {
  let leaves = [...initial];
  const deletes: string[] = [];
  let listCalls = 0;
  server.use(
    http.get('*/api/leaves', ({ request }) => {
      const state = new URL(request.url).searchParams.get('state');
      if (state === null) listCalls++;
      return HttpResponse.json(
        state ? leaves.filter((l) => (l.state as string) === state) : leaves,
      );
    }),
    http.delete('*/api/leaves/:id', async ({ params }) => {
      const id = params.id as string;
      deletes.push(id);
      if (onDelete) return onDelete(id);
      leaves = leaves.filter((l) => l.id !== id);
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return {
    deletes,
    listCalls: () => listCalls,
    remove: (id: string) => {
      leaves = leaves.filter((l) => l.id !== id);
    },
  };
}

/** The table row whose Requester cell starts with `name`. */
async function rowOf(name: string): Promise<HTMLElement> {
  const table = await screen.findByRole('table');
  const row = within(table)
    .getAllByRole('row')
    .find((r) => r.textContent?.startsWith(name));
  if (!row) throw new Error(`no row for ${name}`);
  return row;
}

const deleteIn = (row: HTMLElement) =>
  within(row).queryByRole('button', { name: 'Delete' });

describe('canDeleteLeave (LV-03)', () => {
  it.each([
    ['owner', { id: 'u-me', isAdmin: false }, true],
    ['other user', { id: 'u-x', isAdmin: false }, false],
    ['admin', { id: 'u-x', isAdmin: true }, true],
  ])('%s → %s', (_label, viewer, allowed) => {
    expect(canDeleteLeave(own, viewer)).toBe(allowed);
  });

  it('no session or a missing requester (non-admin) → hidden', () => {
    expect(canDeleteLeave(own, null)).toBe(false);
    expect(
      canDeleteLeave({ requester: null }, { id: 'u-me', isAdmin: false }),
    ).toBe(false);
    expect(
      canDeleteLeave({ requester: null }, { id: 'u-me', isAdmin: true }),
    ).toBe(true);
  });
});

describe('/leaves Delete button (LV-03)', () => {
  it('a user sees Delete on their own row only, no placeholder elsewhere', async () => {
    server.use(session());
    leavesBackend([own, colleagues]);
    renderApp('/leaves');
    expect(deleteIn(await rowOf('Jana Nová'))).toBeInTheDocument();
    const other = await rowOf('Boris Kolega');
    expect(deleteIn(other)).toBeNull();
    expect(within(other).queryAllByRole('button')).toEqual([]);
  });

  it('an admin sees Delete on every row', async () => {
    server.use(session(true));
    leavesBackend([own, colleagues]);
    renderApp('/leaves');
    expect(deleteIn(await rowOf('Jana Nová'))).toBeInTheDocument();
    expect(deleteIn(await rowOf('Boris Kolega'))).toBeInTheDocument();
  });

  it('asks for confirmation with requester, dates and type', async () => {
    server.use(session(true));
    leavesBackend([colleagues]);
    renderApp('/leaves');
    await userEvent.click(deleteIn(await rowOf('Boris Kolega'))!);
    const dialog = screen.getByRole('alertdialog', { name: 'Delete leave?' });
    expect(dialog).toHaveTextContent(
      'Boris Kolega, Dec 1, 2026 – Dec 1, 2026 (Doctor visit). This cannot be undone.',
    );
    expect(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    ).toHaveFocus();
  });

  it('shows the dialog in Slovak', async () => {
    await setLanguage('sk');
    server.use(session());
    leavesBackend([own]);
    renderApp('/leaves');
    await userEvent.click(
      within(await rowOf('Jana Nová')).getByRole('button', {
        name: 'Vymazať',
      }),
    );
    const dialog = screen.getByRole('alertdialog', {
      name: 'Vymazať neprítomnosť?',
    });
    expect(dialog).toHaveTextContent(
      'Jana Nová, 21. 12. 2026 – 23. 12. 2026 (Dovolenka). Túto akciu nie je možné vrátiť späť.',
    );
  });

  it.each([
    [
      'Cancel',
      () => userEvent.click(screen.getByRole('button', { name: 'Cancel' })),
    ],
    ['Esc', () => userEvent.keyboard('{Escape}')],
    ['backdrop', () => userEvent.click(screen.getByTestId('dialog-backdrop'))],
  ] as const)(
    '%s closes the dialog and sends no request',
    async (_l, cancel) => {
      server.use(session());
      const backend = leavesBackend([own]);
      renderApp('/leaves');
      await userEvent.click(deleteIn(await rowOf('Jana Nová'))!);
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      await cancel();
      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(backend.deletes).toEqual([]);
      expect(deleteIn(await rowOf('Jana Nová'))).toBeInTheDocument();
    },
  );

  it('keeps focus inside the dialog (Tab / Shift+Tab cycle), page behind inert, focus back on close', async () => {
    server.use(session());
    leavesBackend([own]);
    const { container } = renderApp('/leaves');
    const trigger = deleteIn(await rowOf('Jana Nová'))!;
    await userEvent.click(trigger);
    const dialog = screen.getByRole('alertdialog');
    const confirm = within(dialog).getByRole('button', { name: 'Delete' });
    const cancel = within(dialog).getByRole('button', { name: 'Cancel' });
    expect(cancel).toHaveFocus();
    expect(container).toHaveAttribute('inert');
    // Order: Delete, Cancel.
    await userEvent.tab();
    expect(confirm).toHaveFocus();
    await userEvent.tab();
    expect(cancel).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(confirm).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(cancel).toHaveFocus();
    await userEvent.click(cancel);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(container).not.toHaveAttribute('inert');
    expect(trigger).toHaveFocus();
  });

  it('invalidates and refetches the summary after a delete (SUM-01)', async () => {
    server.use(session());
    leavesBackend([own]);
    let summaryCalls = 0;
    server.use(
      http.get('*/api/leaves/summary', () => {
        summaryCalls++;
        return HttpResponse.json({ years: [] });
      }),
    );
    const { router, queryClient } = renderApp('/summary');
    expect(await screen.findByText(/no approved leaves/i)).toBeInTheDocument();
    await act(() => router.navigate('/leaves'));
    await userEvent.click(deleteIn(await rowOf('Jana Nová'))!);
    expect(
      queryClient.getQueryState(['leaves', 'summary'])?.isInvalidated,
    ).toBe(false);
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Delete',
      }),
    );
    expect(await screen.findByText('Leave deleted')).toBeInTheDocument();
    expect(
      queryClient.getQueryState(['leaves', 'summary'])?.isInvalidated,
    ).toBe(true);
    const before = summaryCalls;
    await act(() => router.navigate('/summary'));
    await waitFor(() => expect(summaryCalls).toBe(before + 1));
  });

  it('a failed delete returns focus to the Delete button (error toast)', async () => {
    server.use(session());
    leavesBackend([own], () => error(500, 'INTERNAL_ERROR'));
    renderApp('/leaves');
    const trigger = deleteIn(await rowOf('Jana Nová'))!;
    await userEvent.click(trigger);
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Delete',
      }),
    );
    expect(
      await screen.findByText('Something went wrong. Try again later.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('confirm → DELETE; buttons disabled with spinner meanwhile; then row gone, toast, badge drops', async () => {
    server.use(session(true));
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const backend = leavesBackend([own, colleagues], async (id) => {
      await gate;
      backend.remove(id);
      return new HttpResponse(null, { status: 204 });
    });
    renderApp('/leaves');
    // The PENDING colleague's leave is counted by the admin nav badge.
    expect(await screen.findByLabelText('1 pending')).toBeInTheDocument();

    const row = await rowOf('Boris Kolega');
    await userEvent.click(deleteIn(row)!);
    const dialog = screen.getByRole('alertdialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Delete' }),
    );

    await waitFor(() => expect(backend.deletes).toEqual(['L-colleague']));
    const confirm = within(dialog).getByRole('button', { name: 'Delete' });
    expect(confirm).toBeDisabled();
    expect(confirm).toHaveAttribute('aria-busy', 'true');
    expect(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    ).toBeDisabled();
    expect(deleteIn(row)).toBeDisabled();
    // Esc does nothing while the request runs.
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    release();
    expect(await screen.findByText('Leave deleted')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await waitFor(() => expect(screen.queryByText('Boris Kolega')).toBeNull());
    await waitFor(() =>
      expect(screen.queryByLabelText('1 pending')).toBeNull(),
    );
    expect(await rowOf('Jana Nová')).toBeInTheDocument();
  });

  it('403 → error toast with the translated code; the row stays', async () => {
    server.use(session());
    const backend = leavesBackend([own], () =>
      error(403, 'FORBIDDEN', 'You can delete only your own leaves'),
    );
    renderApp('/leaves');
    await userEvent.click(deleteIn(await rowOf('Jana Nová'))!);
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Delete',
      }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You are not authorized to do this.',
    );
    expect(backend.deletes).toEqual(['L-own']);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(deleteIn(await rowOf('Jana Nová'))).toBeEnabled();
  });

  it('404 → "Leave not found." toast and the list is refetched', async () => {
    server.use(session());
    const backend = leavesBackend([own], (id) => {
      backend.remove(id); // deleted meanwhile elsewhere
      return error(404, 'LEAVE_NOT_FOUND', 'Leave not found');
    });
    renderApp('/leaves');
    await userEvent.click(deleteIn(await rowOf('Jana Nová'))!);
    const before = backend.listCalls();
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Delete',
      }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Leave not found.',
    );
    await waitFor(() => expect(backend.listCalls()).toBeGreaterThan(before));
    expect(await screen.findByText('No leaves yet.')).toBeInTheDocument();
  });

  it('a network error → toast; the list is not refetched', async () => {
    server.use(session());
    const backend = leavesBackend([own], async () => {
      await delay(1);
      return HttpResponse.error();
    });
    renderApp('/leaves');
    await userEvent.click(deleteIn(await rowOf('Jana Nová'))!);
    const before = backend.listCalls();
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Delete',
      }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Cannot reach the server. Check your connection.',
    );
    expect(backend.listCalls()).toBe(before);
    expect(deleteIn(await rowOf('Jana Nová'))).toBeEnabled();
  });
});
