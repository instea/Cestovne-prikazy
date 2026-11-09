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

/**
 * Serves `GET /api/auth/me` and `PATCH /api/users/me` from one in-memory
 * user, like the API; records the PATCH bodies.
 */
function profileApi(
  initial: UserDto = userDto(),
  patch?: (body: Record<string, unknown>) => Response | undefined,
) {
  let current = initial;
  const bodies: Record<string, unknown>[] = [];
  const handlers = [
    loggedIn(sessionDto(initial)),
    http.get('*/api/auth/me', () => HttpResponse.json(current)),
    http.patch('*/api/users/me', async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      bodies.push(body);
      const custom = patch?.(body);
      if (custom) return custom;
      current = { ...current, ...body, updatedAt: '2026-11-09T10:00:00.000Z' };
      return HttpResponse.json(current);
    }),
  ];
  return { handlers, bodies };
}

const field = (name: string) => screen.findByLabelText<HTMLInputElement>(name);
const saveButton = () => screen.getByRole('button', { name: 'Save' });

describe('/profile (USR-03)', () => {
  it('shows email and admin flag read-only, names editable', async () => {
    const api = profileApi(userDto({ isAdmin: false }));
    server.use(...api.handlers);
    renderApp('/profile');
    expect(
      await screen.findByRole('heading', { name: 'My profile' }),
    ).toBeInTheDocument();
    const email = await field('Email');
    expect(email).toHaveValue('jana.novak@instea.co');
    expect(email).toHaveAttribute('readonly');
    const admin = await field('Admin');
    expect(admin).toHaveValue('No');
    expect(admin).toHaveAttribute('readonly');
    expect(await field('First name')).toHaveValue('Jana');
    expect(await field('First name')).not.toHaveAttribute('readonly');
    expect(await field('Surname')).toHaveValue('Novák');
    // Unchanged → Save disabled.
    expect(saveButton()).toBeDisabled();
  });

  it('shows "Yes" for an admin', async () => {
    server.use(...profileApi(userDto({ isAdmin: true })).handlers);
    renderApp('/profile');
    expect(await field('Admin')).toHaveValue('Yes');
  });

  it('saves a new surname: toast, header name, form keeps the saved values', async () => {
    const api = profileApi();
    server.use(...api.handlers);
    renderApp('/profile');
    const surname = await field('Surname');
    const nav = screen.getByRole('navigation');
    expect(
      within(nav).getByRole('button', { name: 'Jana Novák' }),
    ).toBeInTheDocument();

    await userEvent.clear(surname);
    await userEvent.type(surname, '  Veselá ');
    expect(saveButton()).toBeEnabled();
    await userEvent.click(saveButton());

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Profile saved.',
    );
    // Only the changed field, trimmed.
    expect(api.bodies).toEqual([{ surname: 'Veselá' }]);
    expect(
      await within(nav).findByRole('button', { name: 'Jana Veselá' }),
    ).toBeInTheDocument();
    expect(sessionStore.get().user?.surname).toBe('Veselá');
    expect(surname).toHaveValue('Veselá');
    expect(saveButton()).toBeDisabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('empty first name: "First name is required." and Save disabled', async () => {
    const api = profileApi();
    server.use(...api.handlers);
    renderApp('/profile');
    const first = await field('First name');
    await userEvent.clear(first);
    expect(screen.getByText('First name is required.')).toBeInTheDocument();
    expect(first).toHaveAttribute('aria-invalid', 'true');
    expect(saveButton()).toBeDisabled();

    await userEvent.type(first, '   ');
    expect(screen.getByText('First name is required.')).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    await userEvent.type(first, '{Enter}');
    expect(api.bodies).toEqual([]);
  });

  it('empty surname and over-long names show their messages', async () => {
    server.use(...profileApi().handlers);
    renderApp('/profile');
    const surname = await field('Surname');
    await userEvent.clear(surname);
    expect(screen.getByText('Surname is required.')).toBeInTheDocument();
    await userEvent.click(surname);
    await userEvent.paste('x'.repeat(101));
    expect(screen.getByText('Maximum 100 characters.')).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  it('an account without surname loads without errors and saves a first-name change', async () => {
    const api = profileApi(userDto({ surname: '' }));
    server.use(...api.handlers);
    renderApp('/profile');
    const surname = await field('Surname');
    expect(surname).toHaveValue('');
    expect(screen.queryByText('Surname is required.')).not.toBeInTheDocument();
    expect(surname).toHaveAttribute('aria-invalid', 'false');

    const first = await field('First name');
    await userEvent.clear(first);
    await userEvent.type(first, 'Janka');
    expect(screen.queryByText('Surname is required.')).not.toBeInTheDocument();
    expect(saveButton()).toBeEnabled();
    await userEvent.click(saveButton());
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Profile saved.',
    );
    // The unchanged empty surname is not sent.
    expect(api.bodies).toEqual([{ firstName: 'Janka' }]);
  });

  it('an account without first name: clearing the surname still says required', async () => {
    const api = profileApi(userDto({ firstName: '' }));
    server.use(...api.handlers);
    renderApp('/profile');
    const surname = await field('Surname');
    expect(
      screen.queryByText('First name is required.'),
    ).not.toBeInTheDocument();
    await userEvent.clear(surname);
    expect(screen.getByText('Surname is required.')).toBeInTheDocument();
    expect(
      screen.queryByText('First name is required.'),
    ).not.toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    // Typing into the empty first name and clearing it again is unchanged.
    const first = await field('First name');
    await userEvent.type(first, 'A');
    await userEvent.clear(first);
    expect(
      screen.queryByText('First name is required.'),
    ).not.toBeInTheDocument();
    expect(api.bodies).toEqual([]);
  });

  it('Cancel resets the form', async () => {
    const api = profileApi();
    server.use(...api.handlers);
    renderApp('/profile');
    const first = await field('First name');
    await userEvent.clear(first);
    await userEvent.type(first, 'Eva');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(first).toHaveValue('Jana');
    expect(saveButton()).toBeDisabled();
    expect(api.bodies).toEqual([]);
  });

  it('API error: red alert with the translated code, no toast, values kept', async () => {
    const api = profileApi(userDto(), () => error(403, 'FIELD_NOT_EDITABLE'));
    server.use(...api.handlers);
    renderApp('/profile');
    const first = await field('First name');
    await userEvent.clear(first);
    await userEvent.type(first, 'Eva');
    await userEvent.click(saveButton());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('This field cannot be changed.');
    // Only the inline alert (the global mutation toast is skipped).
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(first).toHaveValue('Eva');
    expect(sessionStore.get().user?.firstName).toBe('Jana');
  });

  it('API validation error shows "Some values are not valid."', async () => {
    server.use(
      ...profileApi(userDto(), () => error(400, 'VALIDATION_FAILED')).handlers,
    );
    renderApp('/profile');
    const first = await field('First name');
    await userEvent.type(first, 'X');
    await userEvent.click(saveButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Some values are not valid.',
    );
  });

  it('Save is disabled while saving', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const api = profileApi(userDto(), () => undefined);
    server.use(
      ...api.handlers,
      http.patch('*/api/users/me', async () => {
        await gate;
        return HttpResponse.json(userDto({ firstName: 'Eva' }));
      }),
    );
    renderApp('/profile');
    const first = await field('First name');
    await userEvent.clear(first);
    await userEvent.type(first, 'Eva');
    await userEvent.click(saveButton());
    await waitFor(() => expect(saveButton()).toBeDisabled());
    release();
    expect(await screen.findByText('Profile saved.')).toBeInTheDocument();
  });

  it('renders in Slovak with Slovak validation', async () => {
    const { i18n } = await import('../i18n');
    await i18n.changeLanguage('sk');
    server.use(...profileApi().handlers);
    renderApp('/profile');
    expect(
      await screen.findByRole('heading', { name: 'Môj profil' }),
    ).toBeInTheDocument();
    const first = await field('Meno');
    await userEvent.clear(first);
    expect(screen.getByText('Meno je povinné.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Uložiť' })).toBeDisabled();
  });

  it('is reachable from the header Profile item for a non-admin, who has no Users item', async () => {
    server.use(...profileApi().handlers);
    const { router } = renderApp('/leaves');
    const nav = await screen.findByRole('navigation');
    expect(
      within(nav).queryByRole('link', { name: 'Users' }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      within(nav).getByRole('button', { name: 'Jana Novák' }),
    );
    await userEvent.click(screen.getByRole('menuitem', { name: 'Profile' }));
    expect(router.state.location.pathname).toBe('/profile');
    expect(
      await screen.findByRole('heading', { name: 'My profile' }),
    ).toBeInTheDocument();
  });
});
