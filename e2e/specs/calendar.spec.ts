import type { Locator, Page } from '@playwright/test';
import type { ApiClient } from '../support/api';
import type { Persona } from '../support/personas';
import { expect, loginAs, test } from '../support/test';

// LST-03 calendar view and LST-02 filters (both views).

/** Browser "today" inside the seeded month (TST-03: fixed future year). */
const TODAY = new Date('2031-03-15T10:00:00');

const calendar = (page: Page) => page.getByTestId('leaves-calendar');
const event = (page: Page, title: string) =>
  calendar(page).getByText(title, { exact: true });

async function openCalendar(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Calendar' }).click();
  await expect(calendar(page)).toBeVisible();
  await expect(calendar(page)).toContainText('March 2031');
}

/** Background of the nearest ancestor that paints one (the event box). */
function eventBackground(locator: Locator): Promise<string> {
  return locator.evaluate((el) => {
    for (let n: Element | null = el; n; n = n.parentElement) {
      const bg = getComputedStyle(n).backgroundColor;
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
    }
    return '';
  });
}

/** Whether the event's box starts inside the day cell of `date`. */
async function startsOn(page: Page, locator: Locator, date: string) {
  const box = await locator.boundingBox();
  const cell = await calendar(page)
    .locator(`[data-date="${date}"]`)
    .first()
    .boundingBox();
  if (!box || !cell) return false;
  const x = box.x + 2;
  const y = box.y + box.height / 2;
  return (
    x >= cell.x &&
    x <= cell.x + cell.width &&
    y >= cell.y &&
    y <= cell.y + cell.height
  );
}

/** Alice: APPROVED, PENDING half day, REJECTED; Bob: PENDING. */
async function seed(
  api: (p: Persona) => Promise<ApiClient>,
  admin: Persona,
  alice: Persona,
  bob: Persona,
) {
  const aliceApi = await api(alice);
  const bobApi = await api(bob);
  const adminApi = await api(admin);
  const approved = await aliceApi.createLeave({
    startDate: '2031-03-04',
    endDate: '2031-03-05',
  });
  await adminApi.approve(approved.id);
  // PENDING, half day, doctor.
  await aliceApi.createLeave({
    startDate: '2031-03-12',
    endDate: '2031-03-12',
    type: 'DOCTOR',
    isHalfDay: true,
  });
  const rejected = await aliceApi.createLeave({
    startDate: '2031-03-19',
    endDate: '2031-03-19',
    type: 'SICKNESS',
  });
  await adminApi.reject(rejected.id);
  await bobApi.createLeave({ startDate: '2031-03-20' });
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(TODAY);
});

test('approved and pending leaves are shown on their days, rejected hidden', async ({
  page,
  admin,
  alice,
  bob,
  api,
}) => {
  await seed(api, admin, alice, bob);
  await loginAs(page, alice);
  await openCalendar(page);

  const approved = event(page, `${alice.name} (A)`).first();
  const pending = event(page, `${alice.name} 1/2 (D)`);
  await expect(approved).toBeVisible();
  await expect(pending).toBeVisible();
  await expect(event(page, `${alice.name} (S)`)).toHaveCount(0);
  await expect(event(page, `${bob.name} (A)`)).toBeVisible();

  expect(await startsOn(page, approved, '2031-03-04')).toBe(true);
  expect(await startsOn(page, pending, '2031-03-12')).toBe(true);

  // APPROVED opaque, PENDING the same colour at alpha 0.5.
  const approvedBg = await eventBackground(approved);
  const pendingBg = await eventBackground(pending);
  expect(approvedBg).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
  expect(pendingBg).toBe(
    approvedBg.replace('rgb(', 'rgba(').replace(')', ', 0.5)'),
  );

  // Same colour for the user after a reload (the view resets to List).
  await page.reload();
  await openCalendar(page);
  expect(await eventBackground(event(page, `${alice.name} (A)`).first())).toBe(
    approvedBg,
  );
});

test('prev / next / today navigation', async ({ page, alice }) => {
  await loginAs(page, alice);
  await openCalendar(page);
  const title = calendar(page).getByRole('heading', { level: 2 });
  await expect(title).toHaveText('March 2031');
  await calendar(page).getByRole('button', { name: 'Next Month' }).click();
  await expect(title).toHaveText('April 2031');
  await calendar(page).getByRole('button', { name: 'Previous Month' }).click();
  await calendar(page).getByRole('button', { name: 'Previous Month' }).click();
  await expect(title).toHaveText('February 2031');
  const today = calendar(page).getByRole('button', { name: 'This Month' });
  await expect(today).toHaveText('Today');
  await today.click();
  await expect(title).toHaveText('March 2031');
});

test('filters apply to the calendar and carry over from the list', async ({
  page,
  admin,
  alice,
  bob,
  api,
}) => {
  await seed(api, admin, alice, bob);
  await loginAs(page, alice);

  // List: filter by requester + month, rows reduce.
  const rows = page.getByRole('row');
  // count() does not wait: let the table render the seeded leaves first.
  await expect(rows.filter({ hasText: bob.name })).toHaveCount(1);
  const before = await rows.count();
  await page.getByRole('button', { name: 'Requester', exact: true }).click();
  await page
    .getByRole('group', { name: 'Requester' })
    .getByLabel(alice.name)
    .check();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Month', exact: true }).click();
  await page.getByRole('group', { name: 'Month' }).getByLabel('March').check();
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'Requester (1)' }),
  ).toBeVisible();
  // Header row + alice's three March leaves (rejected included in the list).
  await expect(rows).toHaveCount(4);
  expect(before).toBeGreaterThan(4);

  // The same filter applies in the calendar.
  await openCalendar(page);
  await expect(event(page, `${alice.name} 1/2 (D)`)).toBeVisible();
  await expect(event(page, `${bob.name} (A)`)).toHaveCount(0);

  // Clear filter restores everything.
  await page.getByRole('button', { name: 'Clear filter' }).click();
  await expect(event(page, `${bob.name} (A)`)).toBeVisible();
  await page.getByRole('button', { name: 'List' }).click();
  await expect(rows).toHaveCount(before);
});
