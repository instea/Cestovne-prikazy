import type { UserDto } from '@leaves/shared/dto';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { sessionStore } from '../auth/session';
import { sessionDto, userDto } from '../test/fixtures';
import { renderApp } from '../test/render-app';
import { error, loggedIn, server } from '../test/server';
import { dismissToast, getToasts } from '../ui/toast-store';

// Toasts live in a module store and outlast a test's render.
afterEach(() => getToasts().forEach((t) => dismissToast(t.id)));

const adminUser = userDto({
  id: 'me',
  email: 'boss@instea.co',
  firstName: 'Peter',
  surname: 'Admin',
  isAdmin: true,
});

/**
 * `GET`/`PATCH /api/users/:id`, `GET /api/users` and `GET /api/auth/me`
 * from one in-memory user list, like the API; records the PATCH bodies.
 */
function usersApi(
  users: UserDto[],
  patch?: (body: Record<string, unknown>) => Response | undefined,
) {
  const byId = new Map(users.map((u) => [u.id, u]));
  const bodies: Record<string, unknown>[] = [];
  const calls = { get: 0 };
  const handlers = [
    http.get('*/api/users', () => HttpResponse.json([...byId.values()])),
    http.get('*/api/users/:id', ({ params }) => {
      calls.get++;
      const user = byId.get(String(params.id));
      return user ? HttpResponse.json(user) : error(404, 'USER_NOT_FOUND');
    }),
    http.patch('*/api/users/:id', async ({ params, request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      bodies.push(body);
      const custom = patch?.(body);
      if (custom) return custom;
      const next = {
        ...byId.get(String(params.id))!,
        ...body,
        updatedAt: '2026-11-09T10:00:00.000Z',
      };
      byId.set(next.id, next);
      return HttpResponse.json(next);
    }),
    http.get('*/api/auth/me', () => HttpResponse.json(byId.get('me'))),
  ];
  return { handlers, bodies, calls };
}

const field = (name: string) => screen.findByLabelText<HTMLInputElement>(name);
const saveButton = () => screen.getByRole('button', { name: 'Save' });

describe('/users/:id/edit (USR-02)', () => {
  it('shows the user: email and status read-only, names and admin flag editable', async () => {
    const api = usersApi([
      adminUser,
      userDto({
        id: 'u-1',
        active: false,
        deactivatedAt: '2026-10-01T00:00:00.000Z',
      }),
    ]);
    server.use(loggedIn(sessionDto(adminUser)), ...api.handlers);
    renderApp('/users/u-1/edit');
    expect(
      await screen.findByRole('heading', { name: 'Edit user' }),
    ).toBeInTheDocument();
    const email = await field('Email:');
    expect(email).toHaveValue('jana.novak@instea.co');
    expect(email).toHaveAttribute('readonly');
    expect(await field('First name:')).toHaveValue('Jana');
    expect(await field('Surname:')).toHaveValue('Novák');
    const admin = await field('Is admin:');
    expect(admin).toHaveAttribute('type', 'checkbox');
    expect(admin).not.toBeChecked();
    const status = await field('Status:');
    expect(status).toHaveValue('Deactivated');
    expect(status).toHaveAttribute('readonly');
    // Unchanged → nothing to save.
    expect(saveButton()).toBeDisabled();
  });

  it('saves names and the admin flag: only changed fields, toast, back to the list with the new values', async () => {
    const api = usersApi([adminUser, userDto({ id: 'u-1' })]);
    server.use(loggedIn(sessionDto(adminUser)), ...api.handlers);
    const { router } = renderApp('/users/u-1/edit');

    const first = await field('First name:');
    await userEvent.clear(first);
    await userEvent.type(first, ' Eva ');
    const surname = await field('Surname:');
    await userEvent.clear(surname);
    await userEvent.type(surname, 'Malá');
    await userEvent.click(await field('Is admin:'));
    await userEvent.click(saveButton());

    expect(await screen.findByRole('status')).toHaveTextContent('User saved.');
    expect(api.bodies).toEqual([
      { firstName: 'Eva', surname: 'Malá', isAdmin: true },
    ]);
    await waitFor(() => expect(router.state.location.pathname).toBe('/users'));
    const row = (
      await screen.findByRole('cell', { name: 'Malá, Eva' })
    ).closest('tr')!;
    expect(within(row).getByText('Yes')).toBeInTheDocument();
  });

  it('only the admin flag is sent when only it changes', async () => {
    const api = usersApi([adminUser, userDto({ id: 'u-1', isAdmin: true })]);
    server.use(loggedIn(sessionDto(adminUser)), ...api.handlers);
    renderApp('/users/u-1/edit');
    await userEvent.click(await field('Is admin:'));
    await userEvent.click(saveButton());
    await screen.findByRole('status');
    expect(api.bodies).toEqual([{ isAdmin: false }]);
  });

  it('empty first name: "First name is required.", Save disabled, no request', async () => {
    const api = usersApi([adminUser, userDto({ id: 'u-1' })]);
    server.use(loggedIn(sessionDto(adminUser)), ...api.handlers);
    renderApp('/users/u-1/edit');
    const first = await field('First name:');
    await userEvent.clear(first);
    await userEvent.type(first, '   ');
    expect(screen.getByText('First name is required.')).toBeInTheDocument();
    expect(first).toHaveAttribute('aria-invalid', 'true');
    expect(saveButton()).toBeDisabled();
    await userEvent.type(first, '{Enter}');

    const surname = await field('Surname:');
    await userEvent.clear(surname);
    expect(screen.getByText('Surname is required.')).toBeInTheDocument();
    await userEvent.click(surname);
    await userEvent.paste('x'.repeat(101));
    expect(screen.getByText('Maximum 100 characters.')).toBeInTheDocument();
    expect(api.bodies).toEqual([]);
  });

  it('server error: translated inline alert, stays on the page', async () => {
    const api = usersApi([adminUser, userDto({ id: 'u-1' })], () =>
      error(409, 'USER_ANONYMIZED'),
    );
    server.use(loggedIn(sessionDto(adminUser)), ...api.handlers);
    const { router } = renderApp('/users/u-1/edit');
    const surname = await field('Surname:');
    await userEvent.clear(surname);
    await userEvent.type(surname, 'Nová');
    await userEvent.click(saveButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This user is anonymized and cannot be changed.',
    );
    expect(router.state.location.pathname).toBe('/users/u-1/edit');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('unknown user: "User not found." with a link back to the list', async () => {
    const api = usersApi([adminUser]);
    server.use(loggedIn(sessionDto(adminUser)), ...api.handlers);
    const { router } = renderApp('/users/nobody/edit');
    expect(await screen.findByText('User not found.')).toBeInTheDocument();
    expect(screen.queryByLabelText('First name:')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Back to users' }));
    expect(router.state.location.pathname).toBe('/users');
  });

  it('other load errors: message with Retry', async () => {
    let fail = true;
    server.use(
      loggedIn(sessionDto(adminUser)),
      http.get('*/api/users/:id', () =>
        fail ? error(403, 'FORBIDDEN') : HttpResponse.json(userDto()),
      ),
    );
    renderApp('/users/u-1/edit');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'Error while fetching the user: You are not authorized to do this.',
    );
    fail = false;
    await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(await field('First name:')).toHaveValue('Jana');
  });

  it('shows a spinner while loading', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    server.use(
      loggedIn(sessionDto(adminUser)),
      http.get('*/api/users/:id', async () => {
        await gate;
        return HttpResponse.json(userDto());
      }),
    );
    renderApp('/users/u-1/edit');
    await screen.findByRole('heading', { name: 'Edit user' });
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    release();
    expect(await field('First name:')).toBeInTheDocument();
  });

  it('Cancel goes back to /users without a request', async () => {
    const api = usersApi([adminUser, userDto({ id: 'u-1' })]);
    server.use(loggedIn(sessionDto(adminUser)), ...api.handlers);
    const { router } = renderApp('/users/u-1/edit');
    await userEvent.type(await field('Surname:'), 'x');
    await userEvent.click(screen.getByRole('link', { name: 'Cancel' }));
    expect(router.state.location.pathname).toBe('/users');
    expect(api.bodies).toEqual([]);
  });

  it('self-demotion: refetches /api/auth/me, admin menus disappear, goes to /leaves', async () => {
    const api = usersApi([adminUser]);
    server.use(loggedIn(sessionDto(adminUser)), ...api.handlers);
    const { router } = renderApp('/users/me/edit');
    const nav = await screen.findByRole('navigation');
    expect(
      within(nav).getByRole('link', { name: 'Users' }),
    ).toBeInTheDocument();
    await userEvent.click(await field('Is admin:'));
    await userEvent.click(saveButton());

    await waitFor(() => expect(router.state.location.pathname).toBe('/leaves'));
    expect(api.bodies).toEqual([{ isAdmin: false }]);
    await waitFor(() =>
      expect(
        within(nav).queryByRole('link', { name: 'Users' }),
      ).not.toBeInTheDocument(),
    );
    expect(sessionStore.get().user?.isAdmin).toBe(false);
  });

  it('self-edit of a name keeps admin rights and updates the header', async () => {
    const api = usersApi([adminUser]);
    server.use(loggedIn(sessionDto(adminUser)), ...api.handlers);
    const { router } = renderApp('/users/me/edit');
    const first = await field('First name:');
    await userEvent.clear(first);
    await userEvent.type(first, 'Pavol');
    await userEvent.click(saveButton());
    await waitFor(() => expect(router.state.location.pathname).toBe('/users'));
    expect(
      await within(screen.getByRole('navigation')).findByRole('button', {
        name: 'Pavol Admin',
      }),
    ).toBeInTheDocument();
  });

  it('non-admin: unauthorized text and no request', async () => {
    const api = usersApi([userDto({ id: 'u-1' })]);
    server.use(loggedIn(), ...api.handlers);
    renderApp('/users/u-1/edit');
    expect(
      await screen.findByText('You are not authorized to view this page!'),
    ).toBeInTheDocument();
    await waitFor(() => expect(api.calls.get).toBe(0));
  });
});
