import { randomUUID } from 'node:crypto';
import { expect, loginAs, test } from '../support/test';

// NFR-06 audit log screen (deferred E2E items).

test('an approved leave shows Leave created and Leave approved rows', async ({
  page,
  admin,
  alice,
  api,
}) => {
  const leave = await (
    await api(alice)
  ).createLeave({ startDate: '2031-10-06' });
  await loginAs(page, admin, '/approval');
  await page
    .getByRole('row')
    .filter({ hasText: alice.name })
    .getByRole('button', { name: 'Approve' })
    .click();
  await expect(page.getByText('Leave approved.')).toBeVisible();

  await page
    .getByRole('navigation')
    .getByRole('link', { name: 'Audit log' })
    .click();
  await expect(page.getByRole('heading', { name: 'Audit log' })).toBeVisible();
  await page.getByLabel('Target ID').fill(leave.id);
  await page.getByRole('button', { name: 'Apply' }).click();

  const rows = page.getByRole('row');
  // Newest first: header, approved, created.
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(1)).toContainText('Leave approved');
  await expect(rows.nth(1)).toContainText(admin.name);
  await expect(rows.nth(2)).toContainText('Leave created');
  await expect(rows.nth(2)).toContainText(alice.name);
});

test('a filter without matches shows the empty state', async ({
  page,
  admin,
}) => {
  await loginAs(page, admin, '/audit');
  await page.getByLabel('Target ID').fill(randomUUID());
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(
    page.getByText('No audit entries match the filter.'),
  ).toBeVisible();
});

test('51 entries of one actor paginate over two pages', async ({
  page,
  admin,
  bob,
  api,
}) => {
  const bobApi = await api(bob);
  // Bob's registration is one entry; 50 leaves make 51.
  for (let day = 0; day < 50; day++) {
    const date = new Date(Date.UTC(2031, 0, 1 + day))
      .toISOString()
      .slice(0, 10);
    await bobApi.createLeave({ startDate: date });
  }
  await loginAs(page, admin, '/audit');
  await page.getByLabel('Actor').selectOption({ label: bob.name });
  await page.getByRole('button', { name: 'Apply' }).click();

  await expect(page.getByText('Page 1 of 2')).toBeVisible();
  await expect(page.getByRole('row')).toHaveCount(51);
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Page 2 of 2')).toBeVisible();
  await expect(page.getByRole('row')).toHaveCount(2);
  await expect(page.getByRole('row').nth(1)).toContainText('User registered');
});
