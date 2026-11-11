import { expect, loginAs, test } from '../support/test';

// LV-03 delete leave: button, confirmation, permissions.

test('a user deletes an own leave after confirming; Cancel keeps it', async ({
  page,
  alice,
  api,
}) => {
  await (
    await api(alice)
  ).createLeave({
    startDate: '2031-06-02',
    endDate: '2031-06-04',
  });
  await loginAs(page, alice);
  const row = page.getByRole('row').filter({ hasText: alice.name });
  await expect(row).toHaveCount(1);

  await row.getByRole('button', { name: 'Delete' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Delete leave?' });
  await expect(dialog).toContainText(
    `${alice.name}, Jun 2, 2031 – Jun 4, 2031 (Annual leave). This cannot be undone.`,
  );
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await expect(row).toHaveCount(1);

  await row.getByRole('button', { name: 'Delete' }).click();
  await dialog.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Leave deleted')).toBeVisible();
  await expect(row).toHaveCount(0);

  // Gone on the server too.
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Annual / Sick leaves' }),
  ).toBeVisible();
  await expect(
    page.getByRole('row').filter({ hasText: alice.name }),
  ).toHaveCount(0);
});

test("a user sees no Delete on a colleague's leave", async ({
  page,
  alice,
  bob,
  api,
}) => {
  await (await api(bob)).createLeave({ startDate: '2031-06-09' });
  await (await api(alice)).createLeave({ startDate: '2031-06-10' });
  await loginAs(page, alice);

  const bobRow = page.getByRole('row').filter({ hasText: bob.name });
  await expect(bobRow).toHaveCount(1);
  await expect(bobRow.getByRole('button', { name: 'Delete' })).toHaveCount(0);
  const aliceRow = page.getByRole('row').filter({ hasText: alice.name });
  await expect(aliceRow.getByRole('button', { name: 'Delete' })).toBeVisible();
});

test("an admin deletes a colleague's leave", async ({
  page,
  admin,
  bob,
  api,
}) => {
  const bobApi = await api(bob);
  const leave = await bobApi.createLeave({ startDate: '2031-06-16' });
  await (await api(admin)).approve(leave.id);
  await loginAs(page, admin);

  const row = page.getByRole('row').filter({ hasText: bob.name });
  await expect(row).toContainText('Approved');
  await row.getByRole('button', { name: 'Delete' }).click();
  await page
    .getByRole('alertdialog', { name: 'Delete leave?' })
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect(page.getByText('Leave deleted')).toBeVisible();
  await expect(row).toHaveCount(0);
});
