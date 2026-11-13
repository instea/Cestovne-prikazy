import type { Page } from '@playwright/test';
import { APPROVER_EMAIL } from '../support/env';
import { waitForMail } from '../support/mailpit';
import type { Persona } from '../support/personas';
import { expect, loginAs, test } from '../support/test';

// LV-02 add-leave screen (with LV-01 / WD-01 rules) and NOT-02 email.

async function openForm(page: Page, persona: Persona): Promise<void> {
  await loginAs(page, persona);
  await page.getByRole('link', { name: 'Add' }).click();
  await expect(page).toHaveURL(/\/leaves\/new$/);
  await expect(
    page.getByRole('heading', { name: 'Add new leave' }),
  ).toBeVisible();
}

const workDays = (page: Page) => page.getByLabel('Number of work days missed');
const submit = (page: Page) => page.getByRole('button', { name: 'Add leave' });

test('full day: listed as Pending and the approver gets one email', async ({
  page,
  alice,
}) => {
  await openForm(page, alice);
  await page.getByLabel('Type').selectOption({ label: 'Doctor visit' });
  await page.getByLabel('Start date').fill('2031-03-10');
  // End follows Start until edited.
  await expect(page.getByLabel('End date')).toHaveValue('2031-03-10');
  await expect(workDays(page)).toHaveValue('1');
  await submit(page).click();

  await expect(page).toHaveURL(/\/leaves$/);
  await expect(page.getByText('Leave created')).toBeVisible();
  const row = page.getByRole('row').filter({ hasText: alice.name });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('Mar 10, 2031 - Mar 10, 2031 (1 work day)');
  await expect(row).toContainText('Doctor visit');
  await expect(row).toContainText('Pending');

  const mail = await waitForMail({
    to: APPROVER_EMAIL,
    subject: 'New leave notification',
    contains: alice.familyName,
  });
  expect(mail.HTML).toContain(alice.name);
  expect(mail.HTML).toContain('Monday, Mar 10, 2031');
  const link = /href="([^"]+)"/.exec(mail.HTML)?.[1];
  expect(link && new URL(link).pathname).toBe('/approval');
});

test('multi-day over a weekend and a holiday counts work days only', async ({
  page,
  alice,
}) => {
  await openForm(page, alice);
  // Tue 29 Apr – Mon 5 May 2031: 1 May (Thu) is a holiday, 3–4 May a weekend.
  await page.getByLabel('Start date').fill('2031-04-29');
  await page.getByLabel('End date').fill('2031-05-05');
  await expect(workDays(page)).toHaveValue('4');
  await submit(page).click();

  const row = page.getByRole('row').filter({ hasText: alice.name });
  await expect(row).toContainText('Apr 29, 2031 - May 5, 2031 (4 work days)');
});

test('Easter: Good Friday and Easter Monday are not work days', async ({
  page,
  alice,
}) => {
  await openForm(page, alice);
  await page.getByLabel('Start date').fill('2031-04-07');
  await page.getByLabel('End date').fill('2031-04-18');
  await expect(workDays(page)).toHaveValue('8');
  await submit(page).click();

  const row = page.getByRole('row').filter({ hasText: alice.name });
  await expect(row).toContainText('(8 work days)');
});

test('half day on a single day counts 0.5', async ({ page, alice }) => {
  await openForm(page, alice);
  await page.getByLabel('Start date').fill('2031-03-12');
  await page.getByLabel('Is half day?').check();
  await expect(workDays(page)).toHaveValue('0.5');
  await submit(page).click();

  const row = page.getByRole('row').filter({ hasText: alice.name });
  await expect(row).toContainText(
    'Mar 12, 2031 - Mar 12, 2031 (0.5 work days)',
  );
});

test('validation messages block submit', async ({ page, alice, bob, api }) => {
  // Bob's leave: a row that must render before alice's absence is checked.
  await (await api(bob)).createLeave({ startDate: '2031-03-13' });
  await openForm(page, alice);

  // End before start.
  await page.getByLabel('Start date').fill('2031-03-12');
  await page.getByLabel('End date').fill('2031-03-10');
  await expect(
    page.getByText('Start date must not be greater than end date'),
  ).toBeVisible();
  await expect(submit(page)).toBeDisabled();

  // Half day over several days.
  await page.getByLabel('End date').fill('2031-03-14');
  await page.getByLabel('Is half day?').check();
  await expect(
    page.getByText('Half day option is allowed only within single day'),
  ).toBeVisible();
  await expect(submit(page)).toBeDisabled();

  // Empty date.
  await page.getByLabel('Is half day?').uncheck();
  await page.getByLabel('End date').fill('');
  await expect(page.getByText('Required')).toBeVisible();
  await expect(submit(page)).toBeDisabled();

  // Fixed input enables submit again; nothing was saved meanwhile.
  await page.getByLabel('End date').fill('2031-03-14');
  await expect(submit(page)).toBeEnabled();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page).toHaveURL(/\/leaves$/);
  // The list has loaded once Bob's row is there.
  await expect(page.getByRole('row').filter({ hasText: bob.name })).toHaveCount(
    1,
  );
  await expect(
    page.getByRole('row').filter({ hasText: alice.name }),
  ).toHaveCount(0);
});
