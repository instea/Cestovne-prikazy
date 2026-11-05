import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { sessionDto, userDto } from './test/fixtures';
import { renderApp } from './test/render-app';
import { error, loggedIn, server } from './test/server';
import { showToast } from './ui/toast-store';

const admin = () => loggedIn(sessionDto(userDto({ isAdmin: true })));

describe('runtime config bootstrap', () => {
  it('shows a spinner, then the app', async () => {
    server.use(loggedIn());
    renderApp('/leaves');
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: 'Leaves' }),
    ).toBeInTheDocument();
  });

  it('shows an error with Retry, and Retry reloads the config', async () => {
    let calls = 0;
    server.use(
      loggedIn(),
      http.get('*/api/auth/config', () => {
        calls++;
        return calls === 1
          ? error(500, 'INTERNAL_ERROR')
          : HttpResponse.json({
              googleClientId: 'id',
              hostedDomain: 'instea.co',
            });
      }),
    );
    renderApp('/leaves');
    expect(
      await screen.findByText('Cannot load application configuration.'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(
      await screen.findByRole('heading', { name: 'Leaves' }),
    ).toBeInTheDocument();
    expect(calls).toBe(2);
  });
});

describe('route guards', () => {
  it('redirects anonymous users to /login with returnTo', async () => {
    const { router } = renderApp('/summary');
    expect(
      await screen.findByRole('heading', { name: 'Sign in' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.search).toBe('?returnTo=%2Fsummary');
  });

  it.each([
    'REFRESH_TOKEN_EXPIRED',
    'REFRESH_TOKEN_REUSED',
    'REFRESH_TOKEN_INVALID',
  ])(
    'shows /login without a message when boot refresh fails with %s',
    async (code) => {
      server.use(http.post('*/api/auth/refresh', () => error(401, code)));
      const { router } = renderApp('/leaves');
      expect(
        await screen.findByRole('heading', { name: 'Sign in' }),
      ).toBeInTheDocument();
      expect(router.state.location.pathname).toBe('/login');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    },
  );

  it('restores the session from the refresh cookie on reload', async () => {
    server.use(loggedIn());
    const { router } = renderApp('/leaves');
    expect(
      await screen.findByRole('heading', { name: 'Leaves' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/leaves');
  });

  it('sends a logged-in visitor of /login to returnTo', async () => {
    server.use(loggedIn());
    const { router } = renderApp('/login?returnTo=%2Fsummary');
    expect(
      await screen.findByRole('heading', { name: 'Summary' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/summary');
  });

  it('ignores an unsafe returnTo', async () => {
    server.use(loggedIn());
    const { router } = renderApp('/login?returnTo=%2F%2Fevil.example');
    await screen.findByRole('heading', { name: 'Leaves' });
    expect(router.state.location.pathname).toBe('/leaves');
  });

  it('redirects a non-admin away from admin routes and hides admin links', async () => {
    server.use(loggedIn());
    const { router } = renderApp('/users');
    expect(
      await screen.findByRole('heading', { name: 'Leaves' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/leaves');
    const nav = screen.getByRole('navigation');
    expect(
      within(nav).queryByRole('link', { name: /Approval/ }),
    ).not.toBeInTheDocument();
    expect(
      within(nav).queryByRole('link', { name: 'Users' }),
    ).not.toBeInTheDocument();
    expect(
      within(nav).queryByRole('link', { name: 'Audit log' }),
    ).not.toBeInTheDocument();
  });

  it('lets an admin open admin routes', async () => {
    server.use(admin());
    renderApp('/users');
    expect(
      await screen.findByRole('heading', { name: 'Users' }),
    ).toBeInTheDocument();
  });

  it.each(['/whatever', '/'])('redirects %s to /leaves', async (path) => {
    server.use(loggedIn());
    const { router } = renderApp(path);
    await screen.findByRole('heading', { name: 'Leaves' });
    expect(router.state.location.pathname).toBe('/leaves');
  });

  it('shows the deactivated message after USER_DEACTIVATED', async () => {
    server.use(
      http.post('*/api/auth/refresh', () => error(401, 'USER_DEACTIVATED')),
    );
    renderApp('/leaves');
    expect(
      await screen.findByText(
        'Your account has been deactivated. Contact an administrator.',
      ),
    ).toBeInTheDocument();
  });
});

describe('layout', () => {
  it('shows the user name, admin links and the version', async () => {
    server.use(admin());
    renderApp('/leaves');
    const nav = await screen.findByRole('navigation');
    expect(
      within(nav).getByRole('button', { name: 'Jana Novák' }),
    ).toBeInTheDocument();
    expect(
      within(nav).getByRole('link', { name: 'Users' }),
    ).toBeInTheDocument();
    expect(
      within(nav).getByRole('link', { name: 'Audit log' }),
    ).toBeInTheDocument();
    expect(screen.getByText('v1.2.3-test')).toBeInTheDocument();
  });

  it('hides the pending badge at 0 and shows the count otherwise', async () => {
    server.use(admin());
    const first = renderApp('/leaves');
    await screen.findByRole('link', { name: 'Approval' });
    first.unmount();

    server.use(
      http.get('*/api/leaves', ({ request }) =>
        new URL(request.url).searchParams.get('state') === 'PENDING'
          ? HttpResponse.json([{}, {}, {}])
          : HttpResponse.json([]),
      ),
    );
    renderApp('/leaves');
    expect(await screen.findByLabelText('3 pending')).toHaveTextContent('3');
  });

  it('switches language and keeps it after reload', async () => {
    server.use(loggedIn());
    const first = renderApp('/leaves');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Jana Novák' }),
    );
    await userEvent.click(
      screen.getByRole('menuitemradio', { name: 'Slovenčina' }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Dovolenky' }),
    ).toBeInTheDocument();
    expect(localStorage.getItem('lang')).toBe('sk');
    first.unmount();

    renderApp('/leaves');
    expect(
      await screen.findByRole('heading', { name: 'Dovolenky' }),
    ).toBeInTheDocument();
  });

  it('logs out: calls the API, clears the session and goes to /login', async () => {
    let logoutCalls = 0;
    server.use(
      loggedIn(),
      http.post('*/api/auth/logout', () => {
        logoutCalls++;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { router } = renderApp('/leaves');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Jana Novák' }),
    );
    await userEvent.click(screen.getByRole('menuitem', { name: 'Logout' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(logoutCalls).toBe(1);
    expect(
      screen.getByRole('heading', { name: 'Sign in' }),
    ).toBeInTheDocument();
  });

  it('toggles the mobile menu', async () => {
    server.use(loggedIn());
    renderApp('/leaves');
    const toggle = await screen.findByRole('button', { name: 'Menu' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('toasts', () => {
  it('shows and dismisses a toast', async () => {
    server.use(loggedIn());
    renderApp('/leaves');
    await screen.findByRole('heading', { name: 'Leaves' });
    showToast('Something failed');
    const toast = await screen.findByText('Something failed');
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(toast).not.toBeInTheDocument();
  });
});
