import type { UserDto } from '@leaves/shared/dto';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionStore } from '../auth/session';
import { sessionDto, userDto } from '../test/fixtures';
import { renderApp } from '../test/render-app';
import { error, loggedIn, server } from '../test/server';
import { dismissToast, getToasts } from '../ui/toast-store';

// Toasts live in a module store and outlast a test's render.
afterEach(() => getToasts().forEach((t) => dismissToast(t.id)));

const admin = () =>
  loggedIn(sessionDto(userDto({ id: 'me', isAdmin: true, surname: 'Admin' })));

/** Serves `list` (in API order); counts the calls. */
function usersApi(list: UserDto[] | (() => Response)) {
  const calls = { count: 0 };
  const handler = http.get('*/api/users', () => {
    calls.count++;
    return typeof list === 'function' ? list() : HttpResponse.json(list);
  });
  return { handler, calls };
}

const rowOf = (cellText: string) =>
  screen.getByRole('cell', { name: cellText }).closest('tr')!;

describe('/users (USR-01)', () => {
  it('lists users in API order with Email, Name, Admin, Status and actions', async () => {
    const api = usersApi([
      userDto({
        id: 'me',
        email: 'boss@instea.co',
        firstName: 'Peter',
        surname: 'Admin',
        isAdmin: true,
      }),
      userDto({
        id: 'u-d',
        email: 'dana@instea.co',
        firstName: 'Dana',
        surname: 'Bývalá',
        active: false,
        deactivatedAt: '2026-10-01T00:00:00.000Z',
      }),
      userDto({
        id: 'u-n',
        email: 'noname@instea.co',
        firstName: '',
        surname: 'Nová',
      }),
    ]);
    server.use(admin(), api.handler);
    renderApp('/users');

    expect(
      await screen.findByRole('heading', { name: 'Users' }),
    ).toBeInTheDocument();
    await screen.findByRole('cell', { name: 'boss@instea.co' });
    const headers = screen
      .getAllByRole('columnheader')
      .map((h) => h.textContent);
    expect(headers).toEqual(['Email', 'Name', 'Admin', 'Status', 'Actions']);
    // No approval column or action (old "Is approved" / "Approve").
    expect(screen.queryByText(/approve/i)).not.toBeInTheDocument();

    const emails = screen
      .getAllByRole('row')
      .slice(1)
      .map((r) => within(r).getAllByRole('cell')[0]!.textContent);
    expect(emails).toEqual([
      'boss@instea.co',
      'dana@instea.co',
      'noname@instea.co',
    ]);

    const boss = rowOf('boss@instea.co');
    expect(within(boss).getByText('Admin, Peter')).toBeInTheDocument();
    expect(within(boss).getByText('Yes')).toBeInTheDocument();
    expect(within(boss).getByText('Active')).toBeInTheDocument();
    expect(
      within(boss).getByRole('link', { name: 'Edit Admin, Peter' }),
    ).toHaveAttribute('href', '/users/me/edit');

    const dana = rowOf('dana@instea.co');
    expect(within(dana).getByText('No')).toBeInTheDocument();
    expect(within(dana).getByText('Deactivated')).toBeInTheDocument();
    expect(dana).toHaveClass('text-slate-400'); // muted

    // Empty first name: no comma part.
    expect(
      within(rowOf('noname@instea.co')).getByRole('cell', { name: 'Nová' }),
    ).toBeInTheDocument();
    expect(api.calls.count).toBe(1);
  });

  it('Edit opens /users/:id/edit', async () => {
    server.use(admin(), usersApi([userDto({ id: 'u-1' })]).handler);
    const { router } = renderApp('/users');
    await userEvent.click(
      await screen.findByRole('link', { name: 'Edit Novák, Jana' }),
    );
    expect(router.state.location.pathname).toBe('/users/u-1/edit');
  });

  it('shows a spinner while loading', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    server.use(
      admin(),
      http.get('*/api/users', async () => {
        await gate;
        return HttpResponse.json([userDto()]);
      }),
    );
    renderApp('/users');
    await screen.findByRole('heading', { name: 'Users' });
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    release();
    await screen.findByRole('cell', { name: 'jana.novak@instea.co' });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows the translated error with Retry, which reloads', async () => {
    let fail = true;
    server.use(
      admin(),
      // A 4xx is not retried automatically (query-client).
      http.get('*/api/users', () =>
        fail ? error(403, 'FORBIDDEN') : HttpResponse.json([userDto()]),
      ),
    );
    renderApp('/users');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'Error while fetching list: You are not authorized to do this.',
    );
    fail = false;
    await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(
      await screen.findByRole('cell', { name: 'jana.novak@instea.co' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows "No users." for an empty list', async () => {
    server.use(admin(), usersApi([]).handler);
    renderApp('/users');
    expect(await screen.findByText('No users.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('renders in Slovak', async () => {
    localStorage.setItem('lang', 'sk');
    const { i18n } = await import('../i18n');
    await i18n.changeLanguage('sk');
    server.use(
      admin(),
      usersApi([
        userDto({ active: false, deactivatedAt: '2026-10-01T00:00:00.000Z' }),
      ]).handler,
    );
    renderApp('/users');
    expect(
      await screen.findByRole('heading', { name: 'Používatelia' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Deaktivovaný')).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Stav' }),
    ).toBeInTheDocument();
  });

  it('non-admin: unauthorized text, no request, no Users menu item', async () => {
    const api = usersApi([userDto()]);
    server.use(loggedIn(), api.handler);
    renderApp('/users');
    expect(
      await screen.findByText('You are not authorized to view this page!'),
    ).toBeInTheDocument();
    const nav = screen.getByRole('navigation');
    expect(
      within(nav).queryByRole('link', { name: 'Users' }),
    ).not.toBeInTheDocument();
    // Let any stray query fire before asserting none did.
    await waitFor(() => expect(api.calls.count).toBe(0));
  });

  it('admin sees the Users menu item, which opens the list', async () => {
    server.use(admin(), usersApi([userDto()]).handler);
    const { router } = renderApp('/leaves');
    const nav = await screen.findByRole('navigation');
    await userEvent.click(within(nav).getByRole('link', { name: 'Users' }));
    expect(router.state.location.pathname).toBe('/users');
    expect(
      await screen.findByRole('cell', { name: 'jana.novak@instea.co' }),
    ).toBeInTheDocument();
  });
});

/**
 * `GET /api/users` and `POST /api/users/:id/deactivate` over one in-memory
 * list, like the API; records the deactivated ids.
 */
function deactivationApi(
  users: UserDto[],
  deactivate?: (
    id: string,
  ) => Response | Promise<Response | undefined> | undefined,
) {
  let list = users;
  const posted: string[] = [];
  const handlers = [
    http.get('*/api/users', () => HttpResponse.json(list)),
    http.post('*/api/users/:id/deactivate', async ({ params }) => {
      const id = String(params.id);
      posted.push(id);
      const custom = await deactivate?.(id);
      if (custom) return custom;
      list = list.map((u) =>
        u.id === id
          ? { ...u, active: false, deactivatedAt: '2026-11-10T10:00:00.000Z' }
          : u,
      );
      return HttpResponse.json(list.find((u) => u.id === id));
    }),
  ];
  return { handlers, posted };
}

const target = () =>
  userDto({
    id: 'u-1',
    email: 'jana.novak@instea.co',
    firstName: 'Jana',
    surname: 'Novák',
  });

describe('/users deactivate (USR-04)', () => {
  it('Deactivate on every active row incl. the own one, none on deactivated rows', async () => {
    server.use(
      admin(),
      usersApi([
        userDto({
          id: 'me',
          email: 'boss@instea.co',
          surname: 'Admin',
          isAdmin: true,
        }),
        target(),
        userDto({
          id: 'u-d',
          email: 'dana@instea.co',
          active: false,
          deactivatedAt: '2026-10-01T00:00:00.000Z',
        }),
      ]).handler,
    );
    renderApp('/users');
    await screen.findByRole('cell', { name: 'boss@instea.co' });
    for (const email of ['boss@instea.co', 'jana.novak@instea.co']) {
      expect(
        within(rowOf(email)).getByRole('button', { name: /^Deactivate / }),
      ).toHaveTextContent('Deactivate');
    }
    expect(
      within(rowOf('dana@instea.co')).queryByRole('button', {
        name: /^Deactivate/,
      }),
    ).not.toBeInTheDocument();
    // No reactivation action exists.
    expect(screen.queryByText(/reactivate/i)).not.toBeInTheDocument();
  });

  it('confirm: dialog text, request, toast, list refetched with the Deactivated badge', async () => {
    const api = deactivationApi([target()]);
    server.use(admin(), ...api.handlers);
    renderApp('/users');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Deactivate Novák, Jana' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Deactivate user?' });
    expect(dialog).toHaveTextContent(
      'Jana Novák (jana.novak@instea.co) will lose access immediately. Their leaves stay in the system.',
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Deactivate' }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      'User deactivated.',
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.posted).toEqual(['u-1']);
    const row = rowOf('jana.novak@instea.co');
    expect(await within(row).findByText('Deactivated')).toBeInTheDocument();
    expect(
      within(row).queryByRole('button', { name: /^Deactivate/ }),
    ).not.toBeInTheDocument();
  });

  it.each([
    [
      'Cancel',
      () => userEvent.click(screen.getByRole('button', { name: 'Cancel' })),
    ],
    ['Esc', () => userEvent.keyboard('{Escape}')],
    ['backdrop', () => userEvent.click(screen.getByTestId('dialog-backdrop'))],
  ])('%s closes the dialog without a request', async (_label, cancel) => {
    const api = deactivationApi([target()]);
    server.use(admin(), ...api.handlers);
    renderApp('/users');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Deactivate Novák, Jana' }),
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await cancel();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.posted).toEqual([]);
    expect(
      within(rowOf('jana.novak@instea.co')).getByText('Active'),
    ).toBeInTheDocument();
  });

  it('while the call runs: spinner, both buttons disabled, Esc ignored', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const api = deactivationApi([target()], async () => {
      await gate;
      return undefined;
    });
    server.use(admin(), ...api.handlers);
    renderApp('/users');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Deactivate Novák, Jana' }),
    );
    const dialog = screen.getByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: 'Deactivate' });
    await userEvent.click(confirm);
    await waitFor(() => expect(confirm).toBeDisabled());
    expect(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    ).toBeDisabled();
    expect(
      within(dialog).getByTestId('deactivate-spinner'),
    ).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    release();
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });

  it('error: dialog stays open with the translated message, no toast', async () => {
    const api = deactivationApi([target()], () =>
      error(409, 'USER_ALREADY_DEACTIVATED'),
    );
    server.use(admin(), ...api.handlers);
    renderApp('/users');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Deactivate Novák, Jana' }),
    );
    const dialog = screen.getByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Deactivate' }),
    );
    expect(
      await within(dialog).findByText('This user is already deactivated.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(getToasts()).toEqual([]);
  });

  it('self-deactivation: session cleared, /login with the deactivated message', async () => {
    const me = userDto({
      id: 'me',
      email: 'boss@instea.co',
      firstName: 'Peter',
      surname: 'Admin',
      isAdmin: true,
    });
    const api = deactivationApi([me]);
    server.use(loggedIn(sessionDto(me)), ...api.handlers);
    const { router } = renderApp('/users');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Deactivate Admin, Peter' }),
    );
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Deactivate',
      }),
    );
    expect(
      await screen.findByText(
        'Your account has been deactivated. Contact an administrator.',
      ),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(sessionStore.get()).toMatchObject({
      status: 'anonymous',
      accessToken: null,
      endReason: 'USER_DEACTIVATED',
    });
    expect(api.posted).toEqual(['me']);
  });
});

describe('/users export data (NFR-07)', () => {
  let createObjectURL: ReturnType<typeof vi.fn<(blob: Blob) => string>>;
  let clicks: { href: string; download: string }[];

  beforeEach(() => {
    clicks = [];
    createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:export-1');
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicks.push({ href: this.href, download: this.download });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const exportButton = (email: string) =>
    within(rowOf(email)).getByRole('button', { name: /Export data/ });

  it('every row (incl. deactivated / anonymized) has "Export data"; a click downloads the file with the Bearer token', async () => {
    const auth: (string | null)[] = [];
    server.use(
      admin(),
      usersApi([
        target(),
        userDto({
          id: 'u-d',
          email: 'dana@instea.co',
          active: false,
          deactivatedAt: '2026-10-01T00:00:00.000Z',
          anonymizedAt: '2026-10-02T00:00:00.000Z',
        }),
      ]).handler,
      http.get('*/api/admin/users/:id/export', ({ params, request }) => {
        auth.push(request.headers.get('authorization'));
        return HttpResponse.json(
          { formatVersion: 1, user: { id: params.id } },
          {
            headers: {
              'Content-Disposition': `attachment; filename="user-export-${String(params.id)}-2026-11-10.json"`,
            },
          },
        );
      }),
    );
    const { router } = renderApp('/users');
    await screen.findByRole('cell', { name: 'dana@instea.co' });
    expect(exportButton('dana@instea.co')).toHaveTextContent('Export data');
    await userEvent.click(exportButton('jana.novak@instea.co'));
    await waitFor(() => expect(clicks).toHaveLength(1));
    expect(clicks[0]).toEqual({
      href: 'blob:export-1',
      download: 'user-export-u-1-2026-11-10.json',
    });
    const blob = createObjectURL.mock.calls[0]![0];
    expect(JSON.parse(await blob.text())).toMatchObject({
      user: { id: 'u-1' },
    });
    expect(auth).toEqual(['Bearer access-1']);
    // No navigation after success.
    expect(router.state.location.pathname).toBe('/users');
  });

  it('while running: disabled "Exporting…"; then back to "Export data"', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    server.use(
      admin(),
      usersApi([target()]).handler,
      http.get('*/api/admin/users/:id/export', async () => {
        await gate;
        return HttpResponse.json({});
      }),
    );
    renderApp('/users');
    await screen.findByRole('cell', { name: 'jana.novak@instea.co' });
    await userEvent.click(exportButton('jana.novak@instea.co'));
    const row = rowOf('jana.novak@instea.co');
    const running = await within(row).findByRole('button', {
      name: 'Exporting…',
    });
    expect(running).toBeDisabled();
    release();
    expect(
      await within(row).findByRole('button', { name: /Export data/ }),
    ).toBeEnabled();
  });

  it('error: inline alert with the translated code', async () => {
    server.use(
      admin(),
      usersApi([target()]).handler,
      http.get('*/api/admin/users/:id/export', () =>
        error(404, 'USER_NOT_FOUND'),
      ),
    );
    renderApp('/users');
    await screen.findByRole('cell', { name: 'jana.novak@instea.co' });
    await userEvent.click(exportButton('jana.novak@instea.co'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'User not found.',
    );
    expect(clicks).toEqual([]);
  });
});
