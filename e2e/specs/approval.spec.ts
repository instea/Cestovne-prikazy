import type { Page } from '@playwright/test';
import { waitForMail } from '../support/mailpit';
import { expect, loginAs, test } from '../support/test';

// APR-01 / APR-02 approval screen and badge, NOT-03 requester email.

const badge = (page: Page) =>
  page.getByRole('navigation').getByLabel(/^\d+ pending$/);

test('approve: row disappears, badge decrements, requester gets the email', async ({
  page,
  admin,
  alice,
  api,
  rootAdmin,
}) => {
  const aliceApi = await api(alice);
  await aliceApi.createLeave({
    startDate: '2031-07-07',
    endDate: '2031-07-08',
  });
  await aliceApi.createLeave({ startDate: '2031-07-14', type: 'SICKNESS' });
  // Every pending leave in the database counts (single worker: stable).
  const before = (await rootAdmin.pendingLeaves()).length;

  await loginAs(page, admin, '/approval');
  await expect(
    page.getByRole('heading', { name: 'Leaves approval' }),
  ).toBeVisible();
  await expect(badge(page)).toHaveAccessibleName(`${before} pending`);
  await expect(badge(page)).toHaveText(String(before));

  const rows = page.getByRole('row').filter({ hasText: alice.name });
  await expect(rows).toHaveCount(2);
  const row = rows.filter({ hasText: 'Jul 7, 2031' });
  await row.getByRole('button', { name: 'Approve' }).click();

  await expect(page.getByText('Leave approved.')).toBeVisible();
  await expect(row).toHaveCount(0);
  await expect(rows).toHaveCount(1);
  await expect(badge(page)).toHaveText(String(before - 1));

  const mail = await waitForMail({
    to: alice.email,
    subject: 'Your leave was approved',
  });
  expect(mail.HTML).toContain('Monday, Jul 7, 2031 - Tuesday, Jul 8, 2031');
  expect(mail.HTML).toContain(`Approved by: </b>${admin.name}`);

  // The list shows the decision and the approver.
  await page
    .getByRole('navigation')
    .getByRole('link', { name: 'Leaves', exact: true })
    .last()
    .click();
  const listRow = page
    .getByRole('row')
    .filter({ hasText: alice.name })
    .filter({ hasText: 'Jul 7, 2031' });
  await expect(listRow).toContainText('Approved');
  await expect(listRow).toContainText(admin.name);
});

test('reject: row disappears and the requester gets the email', async ({
  page,
  admin,
  bob,
  api,
}) => {
  await (await api(bob)).createLeave({ startDate: '2031-07-21' });
  await loginAs(page, admin, '/approval');
  const row = page.getByRole('row').filter({ hasText: bob.name });
  await row.getByRole('button', { name: 'Reject' }).click();

  await expect(page.getByText('Leave rejected.')).toBeVisible();
  await expect(row).toHaveCount(0);
  const mail = await waitForMail({
    to: bob.email,
    subject: 'Your leave was rejected',
  });
  expect(mail.HTML).toContain(`Rejected by: </b>${admin.name}`);
});

test('an admin approves an own leave', async ({ page, admin, api }) => {
  await (await api(admin)).createLeave({ startDate: '2031-07-22' });
  await loginAs(page, admin, '/approval');
  const row = page.getByRole('row').filter({ hasText: admin.name });
  await row.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('Leave approved.')).toBeVisible();
  await expect(row).toHaveCount(0);
});

test('a leave deleted meanwhile shows the not-found toast and disappears', async ({
  page,
  admin,
  alice,
  api,
}) => {
  const aliceApi = await api(alice);
  const leave = await aliceApi.createLeave({ startDate: '2031-07-23' });
  await loginAs(page, admin, '/approval');
  const row = page.getByRole('row').filter({ hasText: alice.name });
  await expect(row).toHaveCount(1);

  // Real server 404: the requester deletes it after the page loaded.
  await aliceApi.deleteLeave(leave.id);

  await row.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('This leave no longer exists.')).toBeVisible();
  await expect(row).toHaveCount(0);
});

test('on /leaves an admin re-approves a rejected leave and rejects an approved one', async ({
  page,
  admin,
  alice,
  bob,
  api,
}) => {
  const adminApi = await api(admin);
  const rejected = await (
    await api(alice)
  ).createLeave({ startDate: '2031-07-28' });
  const approved = await (
    await api(bob)
  ).createLeave({ startDate: '2031-07-29' });
  await adminApi.reject(rejected.id);
  await adminApi.approve(approved.id);

  await loginAs(page, admin);
  const aliceRow = page.getByRole('row').filter({ hasText: alice.name });
  const bobRow = page.getByRole('row').filter({ hasText: bob.name });
  await expect(aliceRow).toContainText('Rejected');
  // The button of the current state is disabled.
  await expect(aliceRow.getByRole('button', { name: 'Reject' })).toBeDisabled();
  await aliceRow.getByRole('button', { name: 'Approve' }).click();
  await expect(aliceRow).toContainText('Approved');

  await expect(bobRow.getByRole('button', { name: 'Approve' })).toBeDisabled();
  await bobRow.getByRole('button', { name: 'Reject' }).click();
  await expect(bobRow).toContainText('Rejected');
});

test('a user has no Approve / Reject buttons on /leaves (NFR-01)', async ({
  page,
  alice,
  bob,
  api,
}) => {
  await (await api(bob)).createLeave({ startDate: '2031-07-30' });
  await loginAs(page, alice);
  const row = page.getByRole('row').filter({ hasText: bob.name });
  await expect(row).toHaveCount(1);
  await expect(row.getByRole('button', { name: 'Approve' })).toHaveCount(0);
  await expect(row.getByRole('button', { name: 'Reject' })).toHaveCount(0);
});
