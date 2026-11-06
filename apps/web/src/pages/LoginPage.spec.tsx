import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { sessionStore } from '../auth/session';
import { fakeGis } from '../test/fake-gis';
import { sessionDto, userDto } from '../test/fixtures';
import { renderApp } from '../test/render-app';
import { error, server } from '../test/server';

/** AUTH-01 login screen. */

const googleButton = () =>
  screen.findByRole('button', { name: 'Sign in with Google' });

function googleLogin(
  respond: () => Response | Promise<Response> = () =>
    HttpResponse.json(sessionDto(userDto({ isAdmin: true }))),
) {
  const bodies: unknown[] = [];
  server.use(
    http.post('*/api/auth/google', async ({ request }) => {
      bodies.push(await request.json());
      return respond();
    }),
  );
  return bodies;
}

describe('LoginPage (AUTH-01)', () => {
  it('renders the Google button with the client id and hd hint from config', async () => {
    renderApp('/login');
    await googleButton();
    expect(fakeGis.initialized).toEqual([
      { client_id: 'client-id', hd: 'instea.co' },
    ]);
    expect(screen.getByRole('heading', { name: 'Login' })).toBeInTheDocument();
  });

  it('posts the ID token, starts the session and lands on /leaves', async () => {
    const bodies = googleLogin();
    const { router } = renderApp('/login');
    await userEvent.click(await googleButton());
    await waitFor(() => expect(router.state.location.pathname).toBe('/leaves'));
    expect(bodies).toEqual([{ idToken: 'test-id-token' }]);
    expect(sessionStore.get().status).toBe('authenticated');
  });

  it('deep link: /approval → /login?returnTo=%2Fapproval → back to /approval', async () => {
    googleLogin();
    const { router } = renderApp('/approval');
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(router.state.location.search).toBe('?returnTo=%2Fapproval');
    await userEvent.click(await googleButton());
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/approval'),
    );
  });

  it('ignores an unsafe returnTo', async () => {
    googleLogin();
    const { router } = renderApp('/login?returnTo=%2F%2Fevil.example');
    await userEvent.click(await googleButton());
    await waitFor(() => expect(router.state.location.pathname).toBe('/leaves'));
  });

  it('disables the button and shows a spinner while the login is pending', async () => {
    let release!: () => void;
    googleLogin(
      () =>
        new Promise<Response>((resolve) => {
          release = () => resolve(HttpResponse.json(sessionDto()));
        }),
    );
    const { router } = renderApp('/login');
    await userEvent.click(await googleButton());
    expect(await screen.findByRole('status')).toBeInTheDocument();
    const button = screen.getByTestId('google-button');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAttribute('inert');
    release();
    await waitFor(() => expect(router.state.location.pathname).toBe('/leaves'));
  });

  it('ignores a second credential while the login is pending', async () => {
    let release!: () => void;
    const bodies = googleLogin(
      () =>
        new Promise<Response>((resolve) => {
          release = () => resolve(HttpResponse.json(sessionDto()));
        }),
    );
    const { router } = renderApp('/login');
    const button = await googleButton();
    await userEvent.click(button);
    await screen.findByRole('status');
    // Bypasses `inert` / pointer-events: GIS calling back a second time.
    fireEvent.click(button);
    fireEvent.click(button);
    release();
    await waitFor(() => expect(router.state.location.pathname).toBe('/leaves'));
    expect(bodies).toHaveLength(1);
  });

  it('re-enables the button after a failed login', async () => {
    googleLogin(() => error(401, 'LOGIN_FAILED'));
    renderApp('/login');
    await userEvent.click(await googleButton());
    await screen.findByRole('alert');
    expect(screen.getByTestId('google-button')).not.toHaveAttribute('inert');
  });

  it.each([
    [
      'WRONG_DOMAIN',
      () => error(403, 'WRONG_DOMAIN'),
      'Used email does not belong to given hosted domain.',
    ],
    [
      'USER_DEACTIVATED',
      () => error(403, 'USER_DEACTIVATED'),
      'Your account has been deactivated. Contact an administrator.',
    ],
    [
      'LOGIN_FAILED 401',
      () => error(401, 'LOGIN_FAILED'),
      'Login failed. Try again later.',
    ],
    [
      'LOGIN_FAILED 409',
      () => error(409, 'LOGIN_FAILED'),
      'Login failed. Try again later.',
    ],
    [
      'an unknown error',
      () => error(500, 'INTERNAL_ERROR'),
      'Login failed. Try again later.',
    ],
    [
      'a network failure',
      () => HttpResponse.error(),
      'Login failed. Try again later.',
    ],
  ])(
    'shows the message for %s and stays on /login',
    async (_label, respond, text) => {
      googleLogin(respond);
      const { router } = renderApp('/login');
      await userEvent.click(await googleButton());
      expect(await screen.findByRole('alert')).toHaveTextContent(text);
      expect(router.state.location.pathname).toBe('/login');
      expect(sessionStore.get().status).toBe('anonymous');
      // The button is usable again.
      expect(screen.getByTestId('google-button')).toHaveAttribute(
        'aria-disabled',
        'false',
      );
    },
  );

  it('shows the failure message when Google returns no credential', async () => {
    fakeGis.credential = null;
    renderApp('/login');
    await userEvent.click(await googleButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Login failed. Try again later.',
    );
  });

  it('shows the failure message with Retry when the config cannot load', async () => {
    server.use(
      http.get('*/api/auth/config', () => error(500, 'INTERNAL_ERROR')),
    );
    renderApp('/login');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Login failed. Try again later.',
    );
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('has no approval message or action', async () => {
    renderApp('/login');
    await googleButton();
    expect(screen.queryByText(/approved by admin/i)).not.toBeInTheDocument();
  });
});
