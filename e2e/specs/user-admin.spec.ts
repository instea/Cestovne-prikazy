import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { fakeToken, type Persona } from '../support/personas';
import { expect, loginAs, openUserMenu, test } from '../support/test';

// USR-01..04 user administration, USR-03 profile, AUTH-05 deactivation,
// NFR-07 GDPR export and NFR-08 anonymization.

const userRow = (page: Page, persona: Persona) =>
  page.getByRole('row').filter({ hasText: persona.email });

/** USR-01 "Name" column: `surname, firstName`. */
const listName = (p: Persona) => `${p.familyName}, ${p.givenName}`;

test('the admin sees the user list with names, admin flag and status', async ({
  page,
  admin,
  alice,
  carol,
}) => {
  await loginAs(page, admin);
  await page
    .getByRole('navigation')
    .getByRole('link', { name: 'Users' })
    .click();
  await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();

  const aliceRow = userRow(page, alice);
  await expect(aliceRow.getByRole('cell')).toHaveText([
    alice.email,
    listName(alice),
    'No',
    'Active',
    /Edit.*Deactivate.*Export data.*Anonymize/,
  ]);
  await expect(userRow(page, admin).getByRole('cell').nth(2)).toHaveText('Yes');

  // A deactivated user: badge, no Deactivate (no "Reactivate" either).
  const carolRow = userRow(page, carol);
  await expect(carolRow.getByRole('cell').nth(3)).toHaveText('Deactivated');
  await expect(
    carolRow.getByRole('button', { name: /^Deactivate/ }),
  ).toHaveCount(0);
});

test('a non-admin has no Users menu and gets the unauthorized text on /users', async ({
  page,
  alice,
}) => {
  await loginAs(page, alice);
  await expect(
    page.getByRole('navigation').getByRole('link', { name: 'Users' }),
  ).toHaveCount(0);
  await page.goto('/users');
  await expect(page.getByRole('alert')).toHaveText(
    'You are not authorized to view this page!',
  );
  await page.goto(`/users/${alice.sub}/edit`);
  await expect(page.getByRole('alert')).toHaveText(
    'You are not authorized to view this page!',
  );
});

test('the admin edits names and the admin flag; empty name is rejected', async ({
  page,
  admin,
  alice,
}) => {
  await loginAs(page, admin, '/users');
  await userRow(page, alice)
    .getByRole('link', { name: `Edit ${listName(alice)}` })
    .click();
  await expect(page.getByRole('heading', { name: 'Edit user' })).toBeVisible();
  await expect(page.getByLabel('Email:')).toHaveValue(alice.email);
  await expect(page.getByLabel('Email:')).toHaveAttribute('readonly');

  const firstName = page.getByLabel('First name:');
  const save = page.getByRole('button', { name: 'Save' });
  await firstName.fill('');
  await expect(page.getByText('First name is required.')).toBeVisible();
  await expect(save).toBeDisabled();

  await firstName.fill('Alicia');
  await page.getByLabel('Is admin:').check();
  await save.click();

  await expect(page).toHaveURL(/\/users$/);
  await expect(page.getByText('User saved.')).toBeVisible();
  const row = userRow(page, alice);
  await expect(row.getByRole('cell').nth(1)).toHaveText(
    `${alice.familyName}, Alicia`,
  );
  await expect(row.getByRole('cell').nth(2)).toHaveText('Yes');
});

test('a user edits the own profile; email and admin flag are read-only (USR-03)', async ({
  page,
  alice,
}) => {
  await loginAs(page, alice);
  await openUserMenu(page, alice);
  await page.getByRole('menuitem', { name: 'Profile' }).click();
  await expect(page.getByRole('heading', { name: 'My profile' })).toBeVisible();
  await expect(page.getByLabel('Email')).toHaveAttribute('readonly');
  await expect(page.getByLabel('Admin')).toHaveAttribute('readonly');
  await expect(page.getByLabel('Admin')).toHaveValue('No');

  await page.getByLabel('Surname').fill(`Renamed-${alice.familyName}`);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Profile saved.')).toBeVisible();
  // The header follows the session user.
  await expect(
    page.getByRole('button', {
      name: `${alice.givenName} Renamed-${alice.familyName}`,
    }),
  ).toBeVisible();
});

test('deactivate: Cancel keeps the user; confirm signs them out everywhere; leaves stay listed', async ({
  page,
  browser,
  admin,
  bob,
  api,
}) => {
  await (await api(bob)).createLeave({ startDate: '2031-08-04' });

  // Bob is signed in in another browser.
  const bobContext = await browser.newContext();
  const bobPage = await bobContext.newPage();
  await loginAs(bobPage, bob);

  await loginAs(page, admin, '/users');
  const row = userRow(page, bob);
  const deactivate = row.getByRole('button', {
    name: `Deactivate ${listName(bob)}`,
  });
  await deactivate.click();
  const dialog = page.getByRole('dialog', { name: 'Deactivate user?' });
  await expect(dialog).toContainText(
    `${bob.name} (${bob.email}) will lose access immediately. Their leaves stay in the system.`,
  );
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await expect(row.getByRole('cell').nth(3)).toHaveText('Active');

  await deactivate.click();
  await dialog.getByRole('button', { name: 'Deactivate' }).click();
  await expect(page.getByText('User deactivated.')).toBeVisible();
  await expect(row.getByRole('cell').nth(3)).toHaveText('Deactivated');
  await expect(deactivate).toHaveCount(0);

  // AUTH-05: Bob's next request ends his session with the message.
  await bobPage.reload();
  await expect(bobPage).toHaveURL(/\/login/);
  await expect(bobPage.getByRole('alert')).toHaveText(
    'Your account has been deactivated. Contact an administrator.',
  );
  await bobContext.close();

  // He cannot log in again.
  const login = await page.request.post('/api/auth/google', {
    data: { idToken: fakeToken(bob) },
  });
  expect(login.status()).toBe(403);
  expect(((await login.json()) as { code: string }).code).toBe(
    'USER_DEACTIVATED',
  );

  // His leave keeps its requester, marked deactivated.
  await page
    .getByRole('navigation')
    .getByRole('link', { name: 'Leaves', exact: true })
    .last()
    .click();
  await expect(
    page.getByRole('row').filter({ hasText: `${bob.name} (deactivated)` }),
  ).toHaveCount(1);
});

test('an admin who deactivates themselves lands on /login with the message', async ({
  page,
  admin,
}) => {
  await loginAs(page, admin, '/users');
  await userRow(page, admin)
    .getByRole('button', { name: `Deactivate ${listName(admin)}` })
    .click();
  await page
    .getByRole('dialog', { name: 'Deactivate user?' })
    .getByRole('button', { name: 'Deactivate' })
    .click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('alert')).toHaveText(
    'Your account has been deactivated. Contact an administrator.',
  );
});

test('GDPR export downloads the user JSON (NFR-07)', async ({
  page,
  admin,
  alice,
  api,
}) => {
  await (await api(alice)).createLeave({ startDate: '2031-08-11' });
  await loginAs(page, admin, '/users');
  const download = page.waitForEvent('download');
  await userRow(page, alice)
    .getByRole('button', { name: `Export data of ${listName(alice)}` })
    .click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(
    new RegExp(`^user-export-${alice.sub}-\\d{4}-\\d{2}-\\d{2}\\.json$`),
  );
  const data = JSON.parse(await readFile(await file.path(), 'utf8')) as {
    user: { id: string; email: string };
    leavesAsRequester: { startDate: string }[];
  };
  expect(data.user.id).toBe(alice.sub);
  expect(data.user.email).toBe(alice.email);
  expect(data.leavesAsRequester.map((l) => l.startDate)).toEqual([
    '2031-08-11',
  ]);
});

test('GDPR anonymization: typed email confirms; placeholders in list and leaves (NFR-08)', async ({
  page,
  admin,
  alice,
  api,
  rootAdmin,
}) => {
  await (await api(alice)).createLeave({ startDate: '2031-08-18' });
  await loginAs(page, admin, '/users');
  await userRow(page, alice)
    .getByRole('button', { name: `Anonymize ${listName(alice)}` })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Anonymize user' });
  const confirm = dialog.getByRole('button', { name: 'Anonymize' });
  const input = dialog.getByLabel("Type the user's email to confirm");
  await expect(confirm).toBeDisabled();
  await input.fill('someone.else@instea.co');
  await expect(confirm).toBeDisabled();
  await input.fill(`  ${alice.email.toUpperCase()} `);
  await expect(confirm).toBeEnabled();
  await confirm.click();

  await expect(page.getByText('User anonymized.')).toBeVisible();
  await expect(userRow(page, alice)).toHaveCount(0);
  const stored = await rootAdmin.getUser(alice.sub);
  expect(stored.email).toMatch(/^anonymized-[0-9a-f]{8}@anonymized\.invalid$/);
  const token = stored.surname.replace('User ', '');
  const row = page.getByRole('row').filter({ hasText: stored.email });
  await expect(row.getByRole('cell')).toHaveText([
    stored.email,
    `User ${token}, Anonymized`,
    'No',
    'Anonymized',
    'Export data',
  ]);

  await page
    .getByRole('navigation')
    .getByRole('link', { name: 'Leaves', exact: true })
    .last()
    .click();
  await expect(
    page
      .getByRole('row')
      .filter({ hasText: `Anonymized User ${token} (deactivated)` })
      .filter({ hasText: 'Aug 18, 2031' }),
  ).toHaveCount(1);
  await expect(
    page.getByRole('row').filter({ hasText: alice.name }),
  ).toHaveCount(0);
});

test('anonymization is refused while SSO still lists the employee (NFR-08)', async ({
  page,
  admin,
  api,
}) => {
  // Listed in the SSO mock's directory (contract fixture sso.basic.json).
  // A fixed identity: a retry (or --repeat-each) logs the same account in,
  // since the email is unique and a stored name is not updated on login.
  const jana: Persona = {
    role: 'jana',
    sub: 'e2e-jana-sso-listed',
    email: 'jana.nova@instea.co',
    hd: 'instea.co',
    givenName: 'Jana',
    familyName: 'Nová',
    name: 'Jana Nová',
  };
  await api(jana);
  await loginAs(page, admin, '/users');
  await userRow(page, jana)
    .getByRole('button', { name: `Anonymize ${listName(jana)}` })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Anonymize user' });
  await dialog.getByLabel("Type the user's email to confirm").fill(jana.email);
  await dialog.getByRole('button', { name: 'Anonymize' }).click();
  await expect(dialog.getByRole('alert')).toHaveText(
    'This user is still listed as an employee in the company directory. Remove them there first.',
  );
  await expect(userRow(page, jana).getByRole('cell').nth(3)).toHaveText(
    'Active',
  );
});
