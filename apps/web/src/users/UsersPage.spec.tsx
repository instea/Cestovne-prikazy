import type { UserDto } from '@leaves/shared/dto';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { sessionDto, userDto } from '../test/fixtures';
import { renderApp } from '../test/render-app';
import { error, loggedIn, server } from '../test/server';

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
