import type { Page } from '@playwright/test';
import { expect, loginAs, openUserMenu, test } from '../support/test';

// SUM-01 leave summary: APPROVED leaves only, per year (descending) and type.

const yearSection = (page: Page, year: number) =>
  page.getByRole('region', { name: String(year) });

test('counts only APPROVED leaves, per year and type', async ({
  page,
  admin,
  alice,
  api,
}) => {
  const aliceApi = await api(alice);
  const adminApi = await api(admin);
  const approve = async (leave: Promise<{ id: string }>) =>
    adminApi.approve((await leave).id);
  // 2031: 4 + 0.5 approved; pending and rejected do not count.
  await approve(
    aliceApi.createLeave({ startDate: '2031-04-29', endDate: '2031-05-05' }),
  );
  await approve(
    aliceApi.createLeave({
      startDate: '2031-03-12',
      type: 'DOCTOR',
      isHalfDay: true,
    }),
  );
  await aliceApi.createLeave({
    startDate: '2031-06-02',
    endDate: '2031-06-06',
  });
  const rejected = await aliceApi.createLeave({
    startDate: '2031-06-09',
    type: 'SICKNESS',
  });
  await adminApi.reject(rejected.id);
  // 2030: Mon 30 – Tue 31 Dec.
  await approve(
    aliceApi.createLeave({ startDate: '2030-12-30', endDate: '2030-12-31' }),
  );

  await loginAs(page, alice);
  await openUserMenu(page, alice);
  await page.getByRole('menuitem', { name: 'Summary' }).click();
  await expect(
    page.getByRole('heading', { name: 'Leave summary' }),
  ).toBeVisible();

  const years = page.getByRole('heading', { level: 2 });
  await expect(years).toHaveText(['2031', '2030']);
  const y2031 = yearSection(page, 2031);
  await expect(y2031.getByRole('row')).toHaveText([
    /Type\s*Work days/,
    /Annual leave\s*4$/,
    /Doctor visit\s*0\.5$/,
  ]);
  await expect(y2031).not.toContainText('Sick leave');
  await expect(yearSection(page, 2030).getByRole('row').nth(1)).toHaveText(
    /Annual leave\s*2$/,
  );
});

test("an approval in the admin's browser shows up in the requester's summary", async ({
  page,
  browser,
  admin,
  alice,
  api,
}) => {
  await (
    await api(alice)
  ).createLeave({ startDate: '2031-03-03', endDate: '2031-03-07' });
  await loginAs(page, alice, '/summary');
  await expect(
    page.getByText('You have no approved leaves yet.'),
  ).toBeVisible();

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await loginAs(adminPage, admin, '/approval');
  await adminPage
    .getByRole('row')
    .filter({ hasText: alice.name })
    .getByRole('button', { name: 'Approve' })
    .click();
  await expect(adminPage.getByText('Leave approved.')).toBeVisible();
  await adminContext.close();

  // Reopening /summary always refetches.
  await page.goto('/summary');
  await expect(yearSection(page, 2031).getByRole('row').nth(1)).toHaveText(
    /Annual leave\s*5$/,
  );
});
