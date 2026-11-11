import { expect, loginAs, openUserMenu, test } from '../support/test';

// LST-01 leave list states and the List | Calendar toggle (deferred E2E
// items; not one of the TST-03 file names, so kept in their own file).

test('lists the leaves of two users with all columns', async ({
  page,
  admin,
  alice,
  bob,
  api,
}) => {
  const adminApi = await api(admin);
  await (
    await api(alice)
  ).createLeave({
    startDate: '2031-02-03',
    endDate: '2031-02-04',
    type: 'SICKNESS',
  });
  const bobLeave = await (
    await api(bob)
  ).createLeave({ startDate: '2031-02-05' });
  await adminApi.approve(bobLeave.id);

  await loginAs(page, alice);
  await expect(page.getByRole('columnheader')).toHaveText([
    'Requester',
    'Days',
    'Type',
    'State',
    'Approver',
    '',
  ]);
  await expect(
    page.getByRole('row').filter({ hasText: alice.name }).getByRole('cell'),
  ).toHaveText([
    alice.name,
    'Feb 3, 2031 - Feb 4, 2031 (2 work days)',
    'Sick leave',
    'Pending',
    '',
    'Delete',
  ]);
  await expect(
    page.getByRole('row').filter({ hasText: bob.name }).getByRole('cell'),
  ).toHaveText([
    bob.name,
    'Feb 5, 2031 - Feb 5, 2031 (1 work day)',
    'Annual leave',
    'Approved',
    admin.name,
    '',
  ]);
});

test('loading state while the list is slow', async ({ page, alice }) => {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/api/leaves', async (route) => {
    await gate;
    await route.fallback();
  });
  await loginAs(page, alice);
  await expect(
    page.getByRole('status').filter({ hasText: 'Loading leaves…' }),
  ).toBeVisible();
  release();
  await expect(
    page.getByRole('columnheader', { name: 'Requester' }),
  ).toBeVisible();
});

test('error state with Retry', async ({ page, alice }) => {
  let fail = true;
  await page.route('**/api/leaves', (route) =>
    fail ? route.abort('connectionrefused') : route.fallback(),
  );
  await loginAs(page, alice);
  await expect(page.getByText('Could not load leaves.')).toBeVisible({
    timeout: 20_000,
  });
  fail = false;
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(
    page.getByRole('columnheader', { name: 'Requester' }),
  ).toBeVisible();
});

test('empty state', async ({ page, alice }) => {
  // The shared E2E database always has leaves; the empty answer is stubbed.
  await page.route('**/api/leaves', (route) => route.fulfill({ json: [] }));
  await loginAs(page, alice);
  await expect(page.getByText('No leaves yet.')).toBeVisible();
});

test('the view toggle persists across navigation', async ({ page, alice }) => {
  await loginAs(page, alice);
  await page.getByRole('button', { name: 'Calendar' }).click();
  await expect(page.getByTestId('leaves-calendar')).toBeVisible();
  await openUserMenu(page, alice);
  await page.getByRole('menuitem', { name: 'Summary' }).click();
  await expect(
    page.getByRole('heading', { name: 'Leave summary' }),
  ).toBeVisible();
  await page
    .getByRole('navigation')
    .getByRole('link', { name: 'Leaves', exact: true })
    .last()
    .click();
  await expect(page.getByRole('button', { name: 'Calendar' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByTestId('leaves-calendar')).toBeVisible();
});
