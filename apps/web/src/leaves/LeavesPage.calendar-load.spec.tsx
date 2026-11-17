import type { LeaveDto } from '@leaves/shared/dto';
import { LeaveState, LeaveType } from '@leaves/shared/leaves';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setLanguage } from '../i18n';
import { renderApp } from '../test/render-app';
import { loggedIn, server } from '../test/server';
import { clearLeavesFilter } from './filter-store';
import { resetLeavesView } from './view-store';

/** LST-03: the lazily loaded calendar chunk fails to load (e.g. offline). */
const chunk = vi.hoisted(() => ({ failures: 0, imports: 0 }));
vi.mock('./load-calendar', async (importOriginal) => {
  const real = await importOriginal<typeof import('./load-calendar')>();
  return {
    loadLeavesCalendar: () => {
      chunk.imports++;
      if (chunk.failures > 0) {
        chunk.failures--;
        return Promise.reject(new TypeError('Failed to fetch module'));
      }
      return real.loadLeavesCalendar();
    },
  };
});

afterEach(() => {
  chunk.failures = 0;
  chunk.imports = 0;
  clearLeavesFilter();
  resetLeavesView();
});

const jana = {
  id: 'user-2',
  firstName: 'Jana',
  surname: 'Nová',
  active: true,
  anonymized: false,
};
const leave: LeaveDto = {
  id: 'L1',
  requester: jana,
  approver: null,
  startDate: '2026-12-21',
  endDate: '2026-12-23',
  isHalfDay: false,
  type: LeaveType.ANNUAL,
  state: LeaveState.APPROVED,
  numDays: 3,
  createdAt: '2026-11-04T09:12:00.000Z',
  updatedAt: '2026-11-04T09:12:00.000Z',
};

const leavesApi = () =>
  http.get('*/api/leaves', ({ request }) =>
    HttpResponse.json(
      new URL(request.url).searchParams.has('state') ? [] : [leave],
    ),
  );

describe('/leaves Calendar chunk load failure (LST-03)', () => {
  it('shows an inline error with Retry; the rest of the page stays usable', async () => {
    // Suppress React's error-boundary log for the expected failure.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    chunk.failures = 1;
    server.use(loggedIn(), leavesApi());
    renderApp('/leaves');
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: 'Calendar' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not load the calendar.');
    // Still /leaves: heading, Add, filters and the view toggle are there.
    expect(
      screen.getByRole('heading', { name: 'Annual / Sick leaves' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^Requester/ }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('leaves-calendar')).toBeNull();

    // Retry imports the chunk again and shows the calendar.
    await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByTestId('leaves-calendar')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(chunk.imports).toBe(2);
    vi.restoreAllMocks();
  });

  it('the List button still works after the failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    chunk.failures = 1;
    server.use(loggedIn(), leavesApi());
    renderApp('/leaves');
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: 'Calendar' }));
    await screen.findByRole('alert');
    await userEvent.click(screen.getByRole('button', { name: 'List' }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    vi.restoreAllMocks();
  });

  it('SK text', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await setLanguage('sk');
    chunk.failures = 1;
    server.use(loggedIn(), leavesApi());
    renderApp('/leaves');
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: 'Kalendár' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Kalendár sa nepodarilo načítať.',
    );
    vi.restoreAllMocks();
  });
});
