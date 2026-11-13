/* eslint-disable no-empty-pattern -- Playwright fixtures without dependencies take `{}` */
import {
  test as base,
  expect,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import { ApiClient } from './api';
import { promoteAdmin } from './db';
import { stubGoogleScript } from './google-stub';
import { fakeToken, makePersona, type Persona } from './personas';

/**
 * TST-03 fixtures. Personas are unique per test (see `makePersona`):
 * - `admin`: active admin (promoted through the API by the bootstrap admin);
 * - `alice`, `bob`: active users;
 * - `carol`: registered, then deactivated by an admin (USR-04);
 * - `wrongDomain`: a Google account of `other.com` (never registered).
 * `api(persona)` returns a logged-in API client for seeding.
 * Every browser context (the default `context` / `page` and those from
 * `newContext()`) serves a no-op Google Identity Services script, so no test
 * loads the real one from accounts.google.com.
 */
interface Fixtures {
  admin: Persona;
  alice: Persona;
  bob: Persona;
  carol: Persona;
  wrongDomain: Persona;
  /** Bootstrap admin's API client (fresh login per test). */
  rootAdmin: ApiClient;
  api: (persona: Persona) => Promise<ApiClient>;
  /**
   * A second browser (another user signed in elsewhere): a new context with
   * the suite's options and the Google stub, closed after the test. Use it
   * instead of `browser.newContext()`.
   */
  newContext: () => Promise<BrowserContext>;
}

interface WorkerFixtures {
  /** Promoted directly in MongoDB once per worker (AUTH-04 CLI stand-in). */
  rootPersona: Persona;
}

export const test = base.extend<Fixtures, WorkerFixtures>({
  context: async ({ context }, use) => {
    await stubGoogleScript(context);
    await use(context);
  },

  newContext: async ({ browser }, use) => {
    const contexts: BrowserContext[] = [];
    await use(async () => {
      const context = await browser.newContext();
      await stubGoogleScript(context);
      contexts.push(context);
      return context;
    });
    await Promise.all(contexts.map((c) => c.close()));
  },

  rootPersona: [
    async ({}, use) => {
      const persona = makePersona('root');
      const client = await ApiClient.login(persona);
      await promoteAdmin(client.user.id);
      await client.dispose();
      await use(persona);
    },
    { scope: 'worker' },
  ],

  rootAdmin: async ({ rootPersona }, use) => {
    const client = await ApiClient.login(rootPersona);
    await use(client);
    await client.dispose();
  },

  api: async ({}, use) => {
    const clients: ApiClient[] = [];
    await use(async (persona) => {
      const client = await ApiClient.login(persona);
      clients.push(client);
      return client;
    });
    await Promise.all(clients.map((c) => c.dispose()));
  },

  admin: async ({ rootAdmin, api }, use) => {
    const persona = makePersona('admin');
    const client = await api(persona);
    await rootAdmin.updateUser(client.user.id, { isAdmin: true });
    await use(persona);
  },

  alice: async ({ api }, use) => {
    const persona = makePersona('alice');
    await api(persona);
    await use(persona);
  },

  bob: async ({ api }, use) => {
    const persona = makePersona('bob');
    await api(persona);
    await use(persona);
  },

  carol: async ({ rootAdmin, api }, use) => {
    const persona = makePersona('carol');
    const client = await api(persona);
    await rootAdmin.deactivateUser(client.user.id);
    await use(persona);
  },

  wrongDomain: async ({}, use) => {
    await use(makePersona('wrongDomain'));
  },
});

export { expect };

/**
 * TST-03 `loginAs`: the real `POST /api/auth/google` through `page.request`,
 * so the refresh cookie lands in the browser context; the SPA then restores
 * the session via `POST /api/auth/refresh` when `path` loads.
 */
export async function loginAs(
  page: Page,
  persona: Persona,
  path = '/leaves',
): Promise<void> {
  const res = await page.request.post('/api/auth/google', {
    data: { idToken: fakeToken(persona) },
  });
  expect(res.status(), await res.text()).toBe(200);
  await page.goto(path);
  await expect(
    page.getByRole('button', { name: persona.name, exact: true }),
  ).toBeVisible();
}

/** The header's user-menu button, then one of its items. */
export async function openUserMenu(
  page: Page,
  persona: Persona,
): Promise<void> {
  await page.getByRole('button', { name: persona.name, exact: true }).click();
  await expect(page.getByRole('menu')).toBeVisible();
}
