import type { LeaveSummaryDto } from '@leaves/shared/dto';
import { LeaveType } from '@leaves/shared/leaves';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { setLanguage } from '../i18n';
import { LEAVES_ROOT_KEY } from '../layout/query-keys';
import { renderApp } from '../test/render-app';
import { error, loggedIn, server } from '../test/server';

const summaryApi = (summary: () => LeaveSummaryDto) =>
  http.get('*/api/leaves/summary', () => HttpResponse.json(summary()));

/** Per year section: heading and table rows (or the empty-year text). */
function sections() {
  return screen.getAllByRole('region').map((section) => {
    const year = within(section).getByRole('heading').textContent;
    const table = within(section).queryByRole('table');
    return {
      year,
      rows: table
        ? within(table)
            .getAllByRole('row')
            .slice(1)
            .map((row) =>
              within(row)
                .getAllByRole('cell')
                .map((c) => c.textContent),
            )
        : section.querySelector('p')?.textContent,
    };
  });
}

describe('/summary (SUM-01)', () => {
  it('shows one section per year, descending, with type labels and work days', async () => {
    server.use(
      loggedIn(),
      summaryApi(() => ({
        years: [
          {
            year: 2025,
            byType: [
              { type: LeaveType.ANNUAL, workDays: 7 },
              { type: LeaveType.SICKNESS, workDays: 2.5 },
            ],
          },
          { year: 2024, byType: [] },
          { year: 2023, byType: [{ type: LeaveType.DOCTOR, workDays: 0 }] },
        ],
      })),
    );
    renderApp('/summary');
    expect(
      await screen.findByRole('heading', { name: 'Leave summary' }),
    ).toBeInTheDocument();
    await screen.findByRole('heading', { name: '2025' });
    expect(sections()).toEqual([
      {
        year: '2025',
        rows: [
          ['Annual leave', '7'],
          ['Sick leave', '2.5'],
        ],
      },
      { year: '2024', rows: 'No approved leaves in this year.' },
      { year: '2023', rows: [['Doctor visit', '0']] },
    ]);
    const headers = within(screen.getAllByRole('table')[0]!)
      .getAllByRole('columnheader')
      .map((h) => h.textContent);
    expect(headers).toEqual(['Type', 'Work days']);
  });

  it('formats work days per locale in SK', async () => {
    await setLanguage('sk');
    server.use(
      loggedIn(),
      summaryApi(() => ({
        years: [
          { year: 2026, byType: [{ type: LeaveType.ANNUAL, workDays: 2.5 }] },
        ],
      })),
    );
    renderApp('/summary');
    await screen.findByRole('heading', { name: '2026' });
    expect(
      screen.getByRole('heading', { name: 'Prehľad neprítomností' }),
    ).toBeInTheDocument();
    expect(sections()).toEqual([
      { year: '2026', rows: [['Dovolenka', '2,5']] },
    ]);
  });

  it('shows the empty text when there are no approved leaves', async () => {
    server.use(
      loggedIn(),
      summaryApi(() => ({ years: [] })),
    );
    renderApp('/summary');
    expect(
      await screen.findByText('You have no approved leaves yet.'),
    ).toBeInTheDocument();
  });

  it('shows a spinner while loading', async () => {
    server.use(
      loggedIn(),
      http.get('*/api/leaves/summary', async () => {
        await delay(200);
        return HttpResponse.json({ years: [] });
      }),
    );
    renderApp('/summary');
    await screen.findByRole('heading', { name: 'Leave summary' });
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    await screen.findByText('You have no approved leaves yet.');
  });

  it('shows the error with Retry; Retry refetches', async () => {
    let fail = true;
    server.use(
      loggedIn(),
      http.get('*/api/leaves/summary', () =>
        fail
          ? error(500, 'INTERNAL_ERROR')
          : HttpResponse.json({
              years: [
                {
                  year: 2026,
                  byType: [{ type: LeaveType.ANNUAL, workDays: 1 }],
                },
              ],
            }),
      ),
    );
    renderApp('/summary');
    const alert = await screen.findByRole('alert', {}, { timeout: 4000 });
    expect(alert).toHaveTextContent('Could not load the summary. Try again.');
    fail = false;
    await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(
      await screen.findByRole('heading', { name: '2026' }),
    ).toBeInTheDocument();
  });

  it('shows a newly approved leave on reopening (leave queries invalidated)', async () => {
    let workDays = 3;
    server.use(
      loggedIn(),
      summaryApi(() => ({
        years: [{ year: 2026, byType: [{ type: LeaveType.ANNUAL, workDays }] }],
      })),
    );
    const { router, queryClient } = renderApp('/summary');
    expect(await screen.findByRole('cell', { name: '3' })).toBeInTheDocument();

    await act(() => router.navigate('/leaves'));
    await screen.findByRole('heading', { name: 'Annual / Sick leaves' });
    // An admin approves another leave; APR-01 invalidates every leave query.
    workDays = 4;
    await act(() =>
      queryClient.invalidateQueries({ queryKey: LEAVES_ROOT_KEY }),
    );
    await act(() => router.navigate('/summary'));
    expect(await screen.findByRole('cell', { name: '4' })).toBeInTheDocument();
  });
});
