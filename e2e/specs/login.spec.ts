import { stubGoogleSignIn, STUB_BUTTON } from '../support/google-stub';
import { makePersona } from '../support/personas';
import { expect, loginAs, openUserMenu, test } from '../support/test';

// AUTH-01 / AUTH-02 / AUTH-03 / AUTH-05 / NFR-02 in the browser.

test.describe('login page (stubbed Google button)', () => {
  test('first login registers the user and lands on /leaves', async ({
    page,
  }) => {
    const dave = makePersona('dave');
    await stubGoogleSignIn(page, dave);
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();

    await page.getByRole('button', { name: STUB_BUTTON }).click();

    await expect(page).toHaveURL(/\/leaves$/);
    await expect(
      page.getByRole('heading', { name: 'Annual / Sick leaves' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: dave.name })).toBeVisible();
  });

  test('a deep link returns to the requested page after login', async ({
    page,
    alice,
  }) => {
    await stubGoogleSignIn(page, alice);
    await page.goto('/summary');
    await expect(page).toHaveURL(/\/login\?returnTo=%2Fsummary$/);

    await page.getByRole('button', { name: STUB_BUTTON }).click();

    await expect(page).toHaveURL(/\/summary$/);
    await expect(
      page.getByRole('heading', { name: 'Leave summary' }),
    ).toBeVisible();
  });

  test('a wrong-domain account sees the hosted-domain message', async ({
    page,
    wrongDomain,
  }) => {
    await stubGoogleSignIn(page, wrongDomain);
    await page.goto('/login');
    const login = page.waitForResponse('**/api/auth/google');
    await page.getByRole('button', { name: STUB_BUTTON }).click();

    const res = await login;
    expect(res.status()).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe('WRONG_DOMAIN');
    await expect(page.getByRole('alert')).toHaveText(
      'Used email does not belong to given hosted domain.',
    );
    await expect(page).toHaveURL(/\/login/);
  });

  test('a deactivated user sees the deactivated message', async ({
    page,
    carol,
  }) => {
    await stubGoogleSignIn(page, carol);
    await page.goto('/login');
    const login = page.waitForResponse('**/api/auth/google');
    await page.getByRole('button', { name: STUB_BUTTON }).click();

    const res = await login;
    expect(res.status()).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe(
      'USER_DEACTIVATED',
    );
    await expect(page.getByRole('alert')).toHaveText(
      'Your account has been deactivated. Contact an administrator.',
    );
  });
});

test.describe('session', () => {
  test('reload keeps the session', async ({ page, alice }) => {
    await loginAs(page, alice);
    await page.reload();
    await expect(page).toHaveURL(/\/leaves$/);
    await expect(page.getByRole('button', { name: alice.name })).toBeVisible();
  });

  test('tokens are not readable by page scripts (NFR-02)', async ({
    page,
    alice,
  }) => {
    await loginAs(page, alice);
    const exposed = await page.evaluate(() => ({
      local: JSON.stringify({ ...localStorage }),
      session: JSON.stringify({ ...sessionStorage }),
      cookie: document.cookie,
    }));
    expect(exposed.local).not.toMatch(/eyJ|token/i);
    expect(exposed.session).not.toMatch(/eyJ|token/i);
    expect(exposed.cookie).not.toContain('refresh_token');
    const cookies = await page.context().cookies();
    const refresh = cookies.find((c) => c.name === 'refresh_token');
    expect(refresh?.httpOnly).toBe(true);
  });

  test('API calls keep working past the access-token lifetime (AUTH-02)', async ({
    page,
    alice,
  }) => {
    // Bearer token of every API call the SPA makes, in order.
    const bearers: string[] = [];
    page.on('request', (req) => {
      const auth = req.headers()['authorization'];
      if (req.url().includes('/api/') && auth?.startsWith('Bearer ')) {
        bearers.push(auth);
      }
    });
    await page.clock.install();
    await loginAs(page, alice);
    await expect.poll(() => bearers.length).toBeGreaterThan(0);
    const first = bearers[0]!;
    // The server clock is real and tokens carry whole-second `iat` / `exp`:
    // let a second pass so the renewed token cannot be byte-identical.
    await page.waitForTimeout(1_100);

    // Default ACCESS_TOKEN_TTL_SECONDS is 900; the SPA renews 60 s before
    // expiry. Only the browser clock moves, so the server would still accept
    // the old token: the renewal itself must be observed.
    const renewal = page.waitForResponse('**/api/auth/refresh');
    await page.clock.fastForward('16:00');
    expect((await renewal).status()).toBe(200);

    const before = bearers.length;
    await openUserMenu(page, alice);
    await page.getByRole('menuitem', { name: 'Summary' }).click();
    await expect(
      page.getByRole('heading', { name: 'Leave summary' }),
    ).toBeVisible();
    await expect(
      page.getByText('You have no approved leaves yet.'),
    ).toBeVisible();
    const later = bearers.slice(before);
    expect(later.length).toBeGreaterThan(0);
    for (const bearer of later) expect(bearer).not.toBe(first);
  });

  test('without the refresh cookie a reload goes to /login', async ({
    page,
    alice,
  }) => {
    await loginAs(page, alice);
    await page.context().clearCookies();
    await page.reload();
    await expect(page).toHaveURL(/\/login\?returnTo=%2Fleaves$/);
  });

  test('logout goes to /login and stays logged out after reload (AUTH-03)', async ({
    page,
    alice,
  }) => {
    await loginAs(page, alice);
    await openUserMenu(page, alice);
    await page.getByRole('menuitem', { name: 'Logout' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.reload();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
    await page.goto('/leaves');
    await expect(page).toHaveURL(/\/login\?returnTo=%2Fleaves$/);
  });

  test('a user deactivated while signed in is sent to /login with the message (AUTH-05)', async ({
    page,
    alice,
    rootAdmin,
    api,
  }) => {
    await loginAs(page, alice);
    const { user } = await api(alice);
    await rootAdmin.deactivateUser(user.id);

    // The next request with the still-valid access token or the refresh
    // cookie is refused (401 / 403 USER_DEACTIVATED).
    await page.reload();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('alert')).toHaveText(
      'Your account has been deactivated. Contact an administrator.',
    );
  });
});

test.describe('menus by role (AUTH-03 / NFR-01)', () => {
  test('the admin sees Approval, Users and Audit', async ({ page, admin }) => {
    await loginAs(page, admin);
    const nav = page.getByRole('navigation');
    await expect(
      nav.getByRole('link', { name: /Leaves approval/ }),
    ).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Users' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Audit log' })).toBeVisible();
  });

  test('a user sees none of them and gets the unauthorized text by URL', async ({
    page,
    alice,
  }) => {
    await loginAs(page, alice);
    const nav = page.getByRole('navigation');
    await expect(
      nav.getByRole('link', { name: /Leaves approval/ }),
    ).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Users' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Audit log' })).toHaveCount(0);
    for (const path of ['/approval', '/users', '/audit']) {
      await page.goto(path);
      await expect(page.getByRole('alert')).toHaveText(
        'You are not authorized to view this page!',
      );
    }
  });
});
