import type { UserDto } from '@leaves/shared/dto';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { api } from '../api/client';
import { sessionStore } from '../auth/session';
import { sessionDto, userDto } from '../test/fixtures';
import { renderApp } from '../test/render-app';
import { error, loggedIn, server } from '../test/server';
import { dismissToast, getToasts } from '../ui/toast-store';
import { anonymizeConfirmed } from './users';

/** NFR-08 "Anonymize" on `/users` (component tests standing in for E2E). */

afterEach(() => getToasts().forEach((t) => dismissToast(t.id)));

const admin = () =>
  loggedIn(sessionDto(userDto({ id: 'me', isAdmin: true, surname: 'Admin' })));

const rowOf = (cellText: string) =>
  screen.getByRole('cell', { name: cellText }).closest('tr')!;

const target = () =>
  userDto({
    id: 'u-1',
    email: 'jana.novak@instea.co',
    firstName: 'Jana',
    surname: 'Novák',
  });

const anonymized = () =>
  userDto({
    id: 'u-a',
    email: 'anonymized-00000000@anonymized.invalid',
    firstName: 'Anonymized',
    surname: 'User 00000000',
    active: false,
    deactivatedAt: '2026-10-01T00:00:00.000Z',
    anonymizedAt: '2026-10-01T00:00:00.000Z',
  });

const LABEL = "Type the user's email to confirm";

/**
 * `GET /api/users` and `POST /api/admin/users/:id/anonymize` over one
 * in-memory list; records the posted ids and bodies.
 */
function anonymizationApi(
  users: UserDto[],
  anonymize?: (
    id: string,
  ) => Response | Promise<Response | undefined> | undefined,
) {
  let list = users;
  const posted: { id: string; body: unknown }[] = [];
  const handlers = [
    http.get('*/api/users', () => HttpResponse.json(list)),
    http.post(
      '*/api/admin/users/:id/anonymize',
      async ({ params, request }) => {
        const id = String(params.id);
        posted.push({ id, body: await request.json() });
        const custom = await anonymize?.(id);
        if (custom) return custom;
        list = list.map((u) =>
          u.id === id
            ? {
                ...u,
                email: 'anonymized-3f9a1c2b@anonymized.invalid',
                firstName: 'Anonymized',
                surname: 'User 3f9a1c2b',
                isAdmin: false,
                active: false,
                deactivatedAt: '2026-11-10T10:00:00.000Z',
                anonymizedAt: '2026-11-10T10:00:00.000Z',
              }
            : u,
        );
        return HttpResponse.json(list.find((u) => u.id === id));
      },
    ),
  ];
  return { handlers, posted };
}

const openDialog = async (name = 'Anonymize Novák, Jana') => {
  await userEvent.click(await screen.findByRole('button', { name }));
  return screen.getByRole('dialog', { name: 'Anonymize user' });
};

const confirmButton = (dialog: HTMLElement) =>
  within(dialog).getByRole('button', { name: /^Anonymiz/ });

describe('anonymizeConfirmed', () => {
  it('trimmed, lowercased input equals the email', () => {
    expect(
      anonymizeConfirmed(' Jana.Novak@INSTEA.co ', 'jana.novak@instea.co'),
    ).toBe(true);
    expect(
      anonymizeConfirmed('jana.novak@instea.com', 'jana.novak@instea.co'),
    ).toBe(false);
    expect(anonymizeConfirmed('', 'jana.novak@instea.co')).toBe(false);
  });
});

describe('/users anonymize (NFR-08)', () => {
  it('"Anonymize" on every non-anonymized row incl. the own one; anonymized rows: "Anonymized", no Edit / Anonymize', async () => {
    server.use(
      admin(),
      ...anonymizationApi([
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
        anonymized(),
      ]).handlers,
    );
    renderApp('/users');
    await screen.findByRole('cell', { name: 'boss@instea.co' });
    for (const email of [
      'boss@instea.co',
      'jana.novak@instea.co',
      'dana@instea.co',
    ]) {
      expect(
        within(rowOf(email)).getByRole('button', { name: /^Anonymize / }),
      ).toHaveTextContent('Anonymize');
    }
    const anon = rowOf('anonymized-00000000@anonymized.invalid');
    // "Anonymized" takes precedence over "Deactivated".
    expect(within(anon).getByText('Anonymized')).toBeInTheDocument();
    expect(within(anon).queryByText('Deactivated')).not.toBeInTheDocument();
    expect(within(anon).queryByRole('link')).not.toBeInTheDocument();
    expect(
      within(anon).queryByRole('button', { name: /^Anonymize/ }),
    ).not.toBeInTheDocument();
    expect(
      within(anon).getByRole('button', { name: /Export data/ }),
    ).toBeInTheDocument();
    expect(
      within(rowOf('dana@instea.co')).getByText('Deactivated'),
    ).toBeInTheDocument();
  });

  it('dialog texts; "Anonymize" stays disabled until the email is typed (trimmed, any case)', async () => {
    const api = anonymizationApi([target()]);
    server.use(admin(), ...api.handlers);
    renderApp('/users');
    const dialog = await openDialog();
    expect(dialog).toHaveTextContent(
      'This permanently replaces the name and email of jana.novak@instea.co with placeholders, deactivates the account and signs it out. Leaves stay in the system under the placeholder name. This cannot be undone.',
    );
    expect(dialog).not.toHaveTextContent(
      'You are anonymizing your own account',
    );
    const input = within(dialog).getByLabelText(LABEL);
    expect(input).toHaveValue('');
    const confirm = confirmButton(dialog);
    expect(confirm).toHaveTextContent('Anonymize');
    expect(confirm).toBeDisabled();
    expect(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    ).toBeEnabled();

    await userEvent.type(input, 'jana.novak@instea.com');
    expect(confirm).toBeDisabled();
    await userEvent.click(confirm);
    expect(api.posted).toEqual([]);

    await userEvent.clear(input);
    await userEvent.type(input, '  Jana.Novak@INSTEA.co ');
    expect(confirm).toBeEnabled();
  });

  it('confirm: request with the typed email, toast, list refetched with "Anonymized"', async () => {
    const api = anonymizationApi([target()]);
    server.use(admin(), ...api.handlers);
    const { router } = renderApp('/users');
    const dialog = await openDialog();
    await userEvent.type(
      within(dialog).getByLabelText(LABEL),
      'jana.novak@instea.co',
    );
    await userEvent.click(confirmButton(dialog));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'User anonymized.',
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.posted).toEqual([
      { id: 'u-1', body: { confirmEmail: 'jana.novak@instea.co' } },
    ]);
    const row = await waitFor(() =>
      rowOf('anonymized-3f9a1c2b@anonymized.invalid'),
    );
    expect(within(row).getByText('Anonymized')).toBeInTheDocument();
    expect(
      within(row).getByText('User 3f9a1c2b, Anonymized'),
    ).toBeInTheDocument();
    expect(within(row).queryByRole('link')).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/users');
  });

  it('while the call runs: "Anonymizing…", buttons and input disabled, Esc ignored', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const api = anonymizationApi([target()], async () => {
      await gate;
      return undefined;
    });
    server.use(admin(), ...api.handlers);
    renderApp('/users');
    const dialog = await openDialog();
    const input = within(dialog).getByLabelText(LABEL);
    await userEvent.type(input, 'jana.novak@instea.co');
    await userEvent.click(confirmButton(dialog));
    const running = await within(dialog).findByRole('button', {
      name: 'Anonymizing…',
    });
    expect(running).toBeDisabled();
    expect(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    ).toBeDisabled();
    expect(input).toBeDisabled();
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    release();
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });

  it.each([
    [
      'SSO_EMPLOYEE_ACTIVE',
      409,
      'This user is still listed as an employee in the company directory. Remove them there first.',
    ],
    [
      'SSO_UNAVAILABLE',
      503,
      'The company directory is not reachable. Try again later.',
    ],
    ['CONFIRM_EMAIL_MISMATCH', 400, 'The email does not match.'],
    ['USER_ALREADY_ANONYMIZED', 409, 'This user is already anonymized.'],
  ])(
    'error %s: inline alert in the open dialog, no toast',
    async (code, status, text) => {
      const api = anonymizationApi([target()], () => error(status, code));
      server.use(admin(), ...api.handlers);
      renderApp('/users');
      const dialog = await openDialog();
      await userEvent.type(
        within(dialog).getByLabelText(LABEL),
        'jana.novak@instea.co',
      );
      await userEvent.click(confirmButton(dialog));
      expect(await within(dialog).findByRole('alert')).toHaveTextContent(text);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(confirmButton(dialog)).toHaveTextContent('Anonymize');
      expect(getToasts()).toEqual([]);
    },
  );

  it.each([
    [
      'Cancel',
      () => userEvent.click(screen.getByRole('button', { name: 'Cancel' })),
    ],
    ['Esc', () => userEvent.keyboard('{Escape}')],
  ])(
    '%s closes the dialog without a request; reopening starts empty',
    async (_l, cancel) => {
      const api = anonymizationApi([target()]);
      server.use(admin(), ...api.handlers);
      renderApp('/users');
      let dialog = await openDialog();
      await userEvent.type(within(dialog).getByLabelText(LABEL), 'jana');
      await cancel();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(api.posted).toEqual([]);
      dialog = await openDialog();
      expect(within(dialog).getByLabelText(LABEL)).toHaveValue('');
    },
  );

  it('keeps focus inside the dialog; disabled "Anonymize" is skipped; page inert', async () => {
    const api = anonymizationApi([target()]);
    server.use(admin(), ...api.handlers);
    const { container } = renderApp('/users');
    const trigger = await screen.findByRole('button', {
      name: 'Anonymize Novák, Jana',
    });
    await userEvent.click(trigger);
    const dialog = screen.getByRole('dialog');
    const cancel = within(dialog).getByRole('button', { name: 'Cancel' });
    const input = within(dialog).getByLabelText(LABEL);
    expect(cancel).toHaveFocus();
    expect(container).toHaveAttribute('inert');
    await userEvent.tab();
    // Disabled "Anonymize" is skipped: Tab wraps to the input, then Cancel.
    expect(input).toHaveFocus();
    await userEvent.tab();
    expect(cancel).toHaveFocus();
    await userEvent.click(input);
    await userEvent.type(input, 'jana.novak@instea.co');
    // DOM order: input, Cancel, Anonymize (now enabled).
    await userEvent.tab();
    expect(cancel).toHaveFocus();
    await userEvent.tab();
    expect(confirmButton(dialog)).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(container).not.toHaveAttribute('inert');
    expect(trigger).toHaveFocus();
  });

  it('own row: self warning; success clears the session and shows /login', async () => {
    const me = userDto({
      id: 'me',
      email: 'boss@instea.co',
      firstName: 'Peter',
      surname: 'Admin',
      isAdmin: true,
    });
    const api = anonymizationApi([me]);
    server.use(loggedIn(sessionDto(me)), ...api.handlers);
    const { router } = renderApp('/users');
    const dialog = await openDialog('Anonymize Admin, Peter');
    expect(dialog).toHaveTextContent(
      'You are anonymizing your own account. You will be signed out.',
    );
    await userEvent.type(
      within(dialog).getByLabelText(LABEL),
      'boss@instea.co',
    );
    await userEvent.click(confirmButton(dialog));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(sessionStore.get()).toMatchObject({
      status: 'anonymous',
      accessToken: null,
      user: null,
    });
    expect(api.posted).toEqual([
      { id: 'me', body: { confirmEmail: 'boss@instea.co' } },
    ]);
  });

  it('own row: a late 401 USER_DEACTIVATED does not show the deactivated message', async () => {
    const me = userDto({
      id: 'me',
      email: 'boss@instea.co',
      firstName: 'Peter',
      surname: 'Admin',
      isAdmin: true,
    });
    let calls = 0;
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    server.use(
      loggedIn(sessionDto(me)),
      // The first GET loads the page; any later one was sent with the token
      // that the anonymization revokes: it answers 401 USER_DEACTIVATED
      // only after the session has ended (like the API guard).
      http.get('*/api/users', async () => {
        if (++calls === 1) return HttpResponse.json([me]);
        await held;
        return error(401, 'USER_DEACTIVATED');
      }),
      http.post('*/api/admin/users/:id/anonymize', () =>
        HttpResponse.json({
          ...me,
          isAdmin: false,
          active: false,
          anonymizedAt: '2026-11-10T10:00:00.000Z',
        }),
      ),
    );
    const { router } = renderApp('/users');
    const dialog = await openDialog('Anonymize Admin, Peter');
    await userEvent.type(
      within(dialog).getByLabelText(LABEL),
      'boss@instea.co',
    );
    // A request still in flight when the anonymization succeeds.
    const inFlight = api('/users').catch(() => {});
    await userEvent.click(confirmButton(dialog));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    release();
    await inFlight;
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    // No refetch of the list with the revoked token (page load + in flight).
    expect(calls).toBe(2);
    expect(
      screen.queryByText(
        'Your account has been deactivated. Contact an administrator.',
      ),
    ).not.toBeInTheDocument();
    expect(sessionStore.get()).toMatchObject({
      status: 'anonymous',
      endReason: null,
    });
  });

  it('renders the dialog in Slovak', async () => {
    localStorage.setItem('lang', 'sk');
    const { i18n } = await import('../i18n');
    await i18n.changeLanguage('sk');
    const api = anonymizationApi([target()]);
    server.use(admin(), ...api.handlers);
    renderApp('/users');
    const trigger = await screen.findByRole('button', {
      name: 'Anonymizovať Novák, Jana',
    });
    await userEvent.click(trigger);
    const dialog = screen.getByRole('dialog', {
      name: 'Anonymizovať používateľa',
    });
    expect(dialog).toHaveTextContent(
      'Týmto natrvalo nahradíte meno a e-mail používateľa jana.novak@instea.co zástupnými hodnotami, deaktivujete účet a odhlásite ho. Neprítomnosti zostanú v systéme pod zástupným menom. Túto akciu nie je možné vrátiť.',
    );
    expect(
      within(dialog).getByLabelText(
        'Pre potvrdenie zadajte e-mail používateľa',
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: 'Anonymizovať' }),
    ).toBeDisabled();
  });
});
