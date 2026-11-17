import { APPROVER_EMAIL } from '../support/env';
import { stubGoogleSignIn, STUB_BUTTON } from '../support/google-stub';
import { waitForMail } from '../support/mailpit';
import { expect, loginAs, test } from '../support/test';

// NFR-13 UI localization (EN default, SK persisted), NFR-14 English emails.

test('EN by default; SK chosen on /login persists after login and reload', async ({
  page,
  alice,
}) => {
  await stubGoogleSignIn(page, alice);
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  await page.getByLabel('Language').selectOption('sk');
  await expect(
    page.getByRole('heading', { name: 'Prihlásenie' }),
  ).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'sk');

  await page.getByRole('button', { name: STUB_BUTTON }).click();
  const nav = page.getByRole('navigation');
  await expect(
    nav.getByRole('link', { name: 'Neprítomnosti', exact: true }).last(),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Dovolenky / PN' }),
  ).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Dovolenky / PN' }),
  ).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('lang'))).toBe('sk');
});

test('SK calendar toolbar and server validation error in SK', async ({
  page,
  alice,
}) => {
  await page.addInitScript(() => localStorage.setItem('lang', 'sk'));
  await page.clock.setFixedTime(new Date('2031-03-15T10:00:00'));
  await loginAs(page, alice);

  await page.getByRole('button', { name: 'Kalendár' }).click();
  const calendar = page.getByTestId('leaves-calendar');
  await expect(calendar.getByRole('button', { name: 'Dnes' })).toBeVisible();
  await expect(calendar.getByRole('heading', { level: 2 })).toHaveText(
    /marec 2031/i,
  );

  // A body the form would never send: the server's own check answers.
  await page.route('**/api/leaves', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const body = route.request().postDataJSON() as Record<string, unknown>;
    await route.fallback({
      postData: JSON.stringify({
        ...body,
        startDate: '2031-03-14',
        endDate: '2031-03-10',
      }),
    });
  });
  await page.getByRole('link', { name: 'Pridať' }).click();
  await page.getByLabel('Dátum začiatku').fill('2031-03-10');
  const res = page.waitForResponse(
    (r) => r.url().endsWith('/api/leaves') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Pridať neprítomnosť' }).click();
  expect((await res).status()).toBe(400);
  await expect(page.getByRole('alert')).toHaveText(
    'Dátum začiatku nesmie byť neskôr ako dátum konca',
  );
});

test('a leave created in the SK UI sends the English email (NFR-14)', async ({
  page,
  alice,
}) => {
  await page.addInitScript(() => localStorage.setItem('lang', 'sk'));
  await loginAs(page, alice, '/leaves/new');
  await expect(
    page.getByRole('heading', { name: 'Nová neprítomnosť' }),
  ).toBeVisible();
  await page.getByLabel('Dátum začiatku').fill('2031-09-02');
  await page.getByRole('button', { name: 'Pridať neprítomnosť' }).click();
  await expect(page.getByText('Neprítomnosť bola vytvorená')).toBeVisible();
  await expect(
    page.getByRole('row').filter({ hasText: alice.name }),
  ).toContainText('Čaká na schválenie');

  const mail = await waitForMail({
    to: APPROVER_EMAIL,
    subject: 'New leave notification',
    contains: alice.familyName,
  });
  expect(mail.HTML).toContain(
    'New leave was created and needs to be approved.',
  );
  expect(mail.HTML).toContain('Tuesday, Sep 2, 2031');
  expect(mail.HTML).toContain('Annual leave');
});
