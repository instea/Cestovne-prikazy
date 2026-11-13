import type { AuditEntryDto } from '@leaves/shared/audit';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { sessionDto, userDto } from '../test/fixtures';
import { renderApp } from '../test/render-app';
import { error, loggedIn, server } from '../test/server';

const admin = () => loggedIn(sessionDto(userDto({ isAdmin: true })));

function entry(
  i: number,
  overrides: Partial<AuditEntryDto> = {},
): AuditEntryDto {
  return {
    id: `e${i}`,
    at: '2026-11-04T09:15:02.123Z',
    actorType: 'user',
    actorId: 'u1',
    actor: {
      id: 'u1',
      firstName: 'Jana',
      surname: 'Nová',
      active: true,
      anonymized: false,
    },
    action: 'LEAVE_APPROVED',
    targetType: 'LEAVE',
    targetId: `L${i}`,
    details: {
      previousState: 'PENDING',
      newState: 'APPROVED',
      previousApproverId: null,
    },
    ...overrides,
  };
}

/** Serves `total` entries, paged like the API; records request URLs. */
function auditApi(total: number, make = entry) {
  const requests: URL[] = [];
  const handler = http.get('*/api/admin/audit', ({ request }) => {
    const url = new URL(request.url);
    requests.push(url);
    const page = Number(url.searchParams.get('page'));
    const pageSize = Number(url.searchParams.get('pageSize'));
    const all = Array.from({ length: total }, (_, i) => make(i));
    return HttpResponse.json({
      items: all.slice((page - 1) * pageSize, page * pageSize),
      page,
      pageSize,
      total,
    });
  });
  return { handler, requests };
}

const users = http.get('*/api/users', () =>
  HttpResponse.json([
    userDto({ id: 'u2', firstName: 'Zoe', surname: 'Adams' }),
    userDto({ id: 'u1', firstName: 'Jana', surname: 'Nová' }),
  ]),
);

describe('/audit (NFR-06)', () => {
  it('lists entries with time, actor, action, target and details', async () => {
    const api = auditApi(1);
    server.use(admin(), users, api.handler);
    renderApp('/audit');
    expect(
      await screen.findByRole('heading', { name: 'Audit log' }),
    ).toBeInTheDocument();
    const row = (
      await screen.findByRole('cell', { name: 'Leave approved' })
    ).closest('tr')!;
    expect(within(row).getByText('Nov 4, 2026 10:15')).toBeInTheDocument();
    expect(within(row).getByText('Jana Nová')).toBeInTheDocument();
    expect(within(row).getByText('Leave L0')).toBeInTheDocument();
    expect(within(row).getByText('Pending → Approved')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
    expect(api.requests[0]!.searchParams.toString()).toBe('page=1&pageSize=50');
  });

  it('labels CLI and missing actors, and names user targets', async () => {
    server.use(
      admin(),
      users,
      auditApi(2, (i) =>
        i === 0
          ? entry(0, {
              actorType: 'cli',
              actorId: null,
              actor: null,
              action: 'USER_ROLE_CHANGED',
              targetType: 'USER',
              targetId: 'u2',
              details: { before: { isAdmin: false }, after: { isAdmin: true } },
            })
          : entry(1, { actorId: 'gone', actor: null }),
      ).handler,
    );
    renderApp('/audit');
    const cliRow = (
      await screen.findByRole('cell', { name: 'Role changed' })
    ).closest('tr')!;
    expect(within(cliRow).getByText('CLI')).toBeInTheDocument();
    expect(within(cliRow).getByText('User u2 (Zoe Adams)')).toBeInTheDocument();
    expect(within(cliRow).getByText('isAdmin: No → Yes')).toBeInTheDocument();
    expect(
      screen.getByRole('cell', { name: 'Deleted gone' }),
    ).toBeInTheDocument();
  });

  it('applies the action filter, keeps it in the URL and after reload', async () => {
    const api = auditApi(1);
    server.use(admin(), users, api.handler);
    const first = renderApp('/audit');
    await screen.findByRole('cell', { name: 'Leave approved' });
    await userEvent.selectOptions(screen.getByLabelText('Action'), [
      'Leave approved',
    ]);
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() =>
      expect(first.router.state.location.search).toBe('?action=LEAVE_APPROVED'),
    );
    await waitFor(() =>
      expect(api.requests.at(-1)!.searchParams.getAll('action')).toEqual([
        'LEAVE_APPROVED',
      ]),
    );
    first.unmount();

    renderApp('/audit?action=LEAVE_APPROVED');
    const select = await screen.findByLabelText<HTMLSelectElement>('Action');
    expect([...select.selectedOptions].map((o) => o.value)).toEqual([
      'LEAVE_APPROVED',
    ]);
  });

  it('sends the actor filter as actorType=cli or actorId', async () => {
    const api = auditApi(0);
    server.use(admin(), users, api.handler);
    const { router } = renderApp('/audit');
    const actor = await screen.findByLabelText('Actor');
    await screen.findByRole('option', { name: 'Zoe Adams' });
    // users sorted by display name
    expect(
      within(actor)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['All', 'CLI', 'Jana Nová', 'Zoe Adams']);
    await userEvent.selectOptions(actor, 'CLI');
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() =>
      expect(router.state.location.search).toBe('?actorType=cli'),
    );
    await userEvent.selectOptions(screen.getByLabelText('Actor'), 'Zoe Adams');
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() =>
      expect(router.state.location.search).toBe('?actorId=u2'),
    );
  });

  it('rejects From after To on the client without a request', async () => {
    const api = auditApi(0);
    server.use(admin(), users, api.handler);
    const { router } = renderApp('/audit');
    await screen.findByText('No audit entries match the filter.');
    const before = api.requests.length;
    await userEvent.type(screen.getByLabelText('From'), '2026-11-05');
    await userEvent.type(screen.getByLabelText('To'), '2026-11-01');
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(
      screen.getByText(
        'The start of the date range must not be after its end.',
      ),
    ).toBeInTheDocument();
    expect(router.state.location.search).toBe('');
    expect(api.requests.length).toBe(before);
  });

  it('clears all filters', async () => {
    server.use(admin(), users, auditApi(0).handler);
    const { router } = renderApp('/audit?targetType=USER&targetId=u1&page=2');
    await screen.findByText('No audit entries match the filter.');
    expect(screen.getByLabelText('Target ID')).toHaveValue('u1');
    await userEvent.click(screen.getByRole('button', { name: 'Clear filter' }));
    await waitFor(() => expect(router.state.location.search).toBe(''));
    expect(screen.getByLabelText('Target ID')).toHaveValue('');
  });

  it('pages through 51 entries', async () => {
    server.use(admin(), users, auditApi(51).handler);
    const { router } = renderApp('/audit');
    expect(await screen.findByText('Page 1 of 2')).toBeInTheDocument();
    expect(
      screen.getAllByRole('cell', { name: 'Leave approved' }),
    ).toHaveLength(50);
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Page 2 of 2')).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getAllByRole('cell', { name: 'Leave approved' }),
      ).toHaveLength(1),
    );
    expect(router.state.location.search).toBe('?page=2');
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('moves a URL page past the end to the last page', async () => {
    server.use(admin(), users, auditApi(51).handler);
    const { router } = renderApp('/audit?page=5&targetType=LEAVE');
    expect(await screen.findByText('Page 2 of 2')).toBeInTheDocument();
    expect(router.state.location.search).toBe('?targetType=LEAVE&page=2');
    await waitFor(() =>
      expect(
        screen.getAllByRole('cell', { name: 'Leave approved' }),
      ).toHaveLength(1),
    );
    expect(screen.queryByText('Page 5 of 2')).not.toBeInTheDocument();
  });

  it('shows the error text and keeps filters usable', async () => {
    server.use(
      admin(),
      users,
      http.get('*/api/admin/audit', () => error(400, 'AUDIT_RANGE_INVALID')),
    );
    renderApp('/audit');
    expect(
      await screen.findByText(
        'Error while fetching list: The start of the date range must not be after its end.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled();
  });

  it('works when the user list cannot be loaded', async () => {
    server.use(
      admin(),
      http.get('*/api/users', () => error(500, 'INTERNAL_ERROR')),
      auditApi(1).handler,
    );
    renderApp('/audit');
    expect(
      await screen.findByRole('cell', { name: 'Leave approved' }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByLabelText('Actor'))
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['All', 'CLI']);
  });
});
