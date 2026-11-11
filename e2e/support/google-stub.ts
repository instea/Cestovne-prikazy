import type { Page } from '@playwright/test';
import { fakeToken, type Persona } from './personas';

export const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client';
export const STUB_BUTTON = 'Sign in with Google (E2E stub)';

/**
 * TST-03 login-page path: serves a stand-in for the Google Identity Services
 * script. It defines the `google.accounts.id` subset the app uses; its
 * button calls the app's credential callback with a fake ID token for
 * `persona`, exactly where real Google would.
 */
export async function stubGoogleSignIn(
  page: Page,
  persona: Persona,
): Promise<void> {
  await page.route(GIS_SCRIPT_URL, (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `(() => {
  const credential = ${JSON.stringify(fakeToken(persona))};
  let config = null;
  window.google = { accounts: { id: {
    initialize(c) { config = c; },
    renderButton(parent) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = ${JSON.stringify(STUB_BUTTON)};
      button.addEventListener('click', () => config.callback({ credential }));
      parent.appendChild(button);
    },
  } } };
})();`,
    }),
  );
}
