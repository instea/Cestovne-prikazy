import type { CreateLeaveBody, LeaveDto } from '@leaves/shared/dto';
import { LeaveState, LeaveType } from '@leaves/shared/leaves';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLanguage } from '../i18n';
import { sessionDto, userDto } from '../test/fixtures';
import { renderApp } from '../test/render-app';
import { error, loggedIn, server } from '../test/server';
import { dismissToast, getToasts } from '../ui/toast-store';

const me = userDto({ id: 'u-jana', firstName: 'Jana', surname: 'Nová' });

beforeEach(() => {
  // Only Date is faked: "today" is Tuesday 2026-11-10 (browser local).
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 10, 12, 0));
});

afterEach(() => {
  vi.useRealTimers();
  getToasts().forEach((t) => dismissToast(t.id));
});

/**
 * In-memory leaves API: `GET /api/leaves[?state=]` and `POST /api/leaves`
 * (stores a PENDING leave like LV-01, or answers `respond`'s response).
 */
function leavesApi(
  options: {
    user?: typeof me;
    respond?: (body: CreateLeaveBody) => Response | Promise<Response>;
    postDelay?: number;
  } = {},
) {
  const user = options.user ?? me;
  const leaves: LeaveDto[] = [];
  const posts: CreateLeaveBody[] = [];
  const handlers = [
    loggedIn(sessionDto(user)),
    http.get('*/api/leaves', ({ request }) => {
      const state = new URL(request.url).searchParams.get(
        'state',
      ) as LeaveState | null;
      return HttpResponse.json(
        state ? leaves.filter((l) => l.state === state) : leaves,
      );
    }),
    http.post('*/api/leaves', async ({ request }) => {
      const body = (await request.json()) as CreateLeaveBody;
      posts.push(body);
      if (options.postDelay) await delay(options.postDelay);
      if (options.respond) return options.respond(body);
      const leave: LeaveDto = {
        id: `L${posts.length}`,
        requester: {
          id: user.id,
          firstName: user.firstName,
          surname: user.surname,
          active: true,
          anonymized: false,
        },
        approver: null,
        startDate: body.startDate,
        endDate: body.endDate,
        isHalfDay: body.isHalfDay ?? false,
        type: body.type ?? LeaveType.ANNUAL,
        state: LeaveState.PENDING,
        numDays: 5,
        createdAt: '2026-11-10T11:00:00.000Z',
        updatedAt: '2026-11-10T11:00:00.000Z',
      };
      leaves.push(leave);
      return HttpResponse.json(leave, { status: 201 });
    }),
  ];
  return { handlers, posts, leaves };
}

const input = (label: string) => screen.getByLabelText<HTMLInputElement>(label);
const typeSelect = () => screen.getByLabelText<HTMLSelectElement>('Type');
const start = () => input('Start date');
const end = () => input('End date');
const count = () => input('Number of work days missed');
const halfDay = () => input('Is half day?');
const submit = () => screen.getByRole('button', { name: 'Add leave' });

const setDate = (el: HTMLInputElement, value: string) =>
  fireEvent.change(el, { target: { value } });

async function openForm(api = leavesApi()) {
  server.use(...api.handlers);
  const view = renderApp('/leaves/new');
  await screen.findByRole('heading', { name: 'Add new leave' });
  return { ...view, api };
}

function fill(startDate: string, endDate: string) {
  setDate(start(), startDate);
  setDate(end(), endDate);
}

describe('/leaves/new form (LV-02)', () => {
  it('opens with Type = Annual leave, Start = End = today, unchecked half day, today counted', async () => {
    await openForm();
    expect(typeSelect()).toHaveValue('ANNUAL');
    expect(typeSelect()).toHaveDisplayValue('Annual leave');
    expect(start()).toHaveValue('2026-11-10');
    expect(end()).toHaveValue('2026-11-10');
    expect(halfDay()).not.toBeChecked();
    expect(count()).toHaveValue('1');
    expect(count()).toHaveAttribute('readonly');
    expect(submit()).toBeEnabled();
  });

  it('offers every leave type in LEAVE_TYPES order with readable labels', async () => {
    await openForm();
    const options = [...typeSelect().options].map((o) => [o.value, o.text]);
    expect(options).toEqual([
      ['ANNUAL', 'Annual leave'],
      ['SICKNESS', 'Sick leave'],
      ['DOCTOR', 'Doctor visit'],
      ['MATERNITY', 'Maternity leave'],
      ['PARENTAL', 'Parental leave'],
      ['CARING', 'Caring for a relative at home'],
    ]);
  });

  it.each([
    ['a weekend', new Date(2026, 10, 8, 9)],
    ['a public holiday', new Date(2026, 0, 1, 9)],
  ])('counts 0 when today is %s', async (_, today) => {
    vi.setSystemTime(today);
    await openForm();
    expect(count()).toHaveValue('0');
  });

  it('uses the browser-local date as today (late evening)', async () => {
    vi.setSystemTime(new Date(2026, 10, 10, 23, 59));
    await openForm();
    expect(start()).toHaveValue('2026-11-10');
  });

  it('End follows Start until End is edited', async () => {
    await openForm();
    setDate(start(), '2026-11-09');
    expect(end()).toHaveValue('2026-11-09');
    setDate(end(), '2026-11-13');
    setDate(start(), '2026-11-11');
    expect(end()).toHaveValue('2026-11-13');
    expect(start()).toHaveValue('2026-11-11');
  });

  it.each([
    ['2026-11-09', '2026-11-13', false, '5'],
    ['2017-12-22', '2017-12-30', false, '4'], // 24–26 Dec are holidays
    ['2026-11-04', '2026-11-04', true, '0.5'],
    ['2026-11-07', '2026-11-08', false, '0'],
    ['2017-12-07', '2017-12-11', false, '3'], // WD-01: Thu, Fri, Mon
  ])(
    'live count %s → %s (half day %s) is %s and submit is enabled',
    async (from, to, half, expected) => {
      await openForm();
      fill(from, to);
      if (half) await userEvent.click(halfDay());
      expect(count()).toHaveValue(expected);
      expect(submit()).toBeEnabled();
    },
  );

  it('WD-01 2017-12-11 → 2017-12-13 half day: count 2.5 (3 − 0.5) with the half-day message', async () => {
    await openForm();
    fill('2017-12-11', '2017-12-13');
    await userEvent.click(halfDay());
    // The shared WD-01 function does not check the half-day rule (LV-01 does).
    expect(count()).toHaveValue('2.5');
    expect(
      screen.getByText('Half day option is allowed only within single day'),
    ).toBeInTheDocument();
    expect(submit()).toBeDisabled();
  });

  it('End before Start: message, count 0, submit disabled', async () => {
    await openForm();
    fill('2026-11-13', '2026-11-09');
    expect(
      screen.getByText('Start date must not be greater than end date'),
    ).toBeInTheDocument();
    expect(count()).toHaveValue('0');
    expect(submit()).toBeDisabled();
  });

  it('half day over several days: message, submit disabled; unchecking fixes it', async () => {
    await openForm();
    fill('2026-11-09', '2026-11-10');
    await userEvent.click(halfDay());
    expect(
      screen.getByText('Half day option is allowed only within single day'),
    ).toBeInTheDocument();
    expect(submit()).toBeDisabled();
    await userEvent.click(halfDay());
    expect(
      screen.queryByText('Half day option is allowed only within single day'),
    ).not.toBeInTheDocument();
    expect(submit()).toBeEnabled();
  });

  it('a leave of 2 years or more is too long; one day less is allowed', async () => {
    await openForm();
    fill('2026-03-01', '2028-03-01');
    expect(
      screen.getByText('Leave must be shorter than 2 years'),
    ).toBeInTheDocument();
    expect(submit()).toBeDisabled();
    setDate(end(), '2028-02-29');
    expect(
      screen.queryByText('Leave must be shorter than 2 years'),
    ).not.toBeInTheDocument();
    expect(submit()).toBeEnabled();
  });

  it('shows one message at a time, with the shared rule precedence', async () => {
    await openForm();
    fill('2026-01-01', '2029-01-01');
    await userEvent.click(halfDay());
    // LEAVE_TOO_LONG wins over LEAVE_HALF_DAY_MULTIPLE_DAYS (LV-01).
    expect(
      screen.getByText('Leave must be shorter than 2 years'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Half day option is allowed only within single day'),
    ).not.toBeInTheDocument();
  });

  it('empty date → "Required"; outside 2000–2100 → not valid; both block submit', async () => {
    await openForm();
    setDate(end(), '');
    expect(screen.getByText('Required')).toBeInTheDocument();
    expect(end()).toHaveAttribute('aria-invalid', 'true');
    expect(count()).toHaveValue('');
    expect(submit()).toBeDisabled();

    fill('1999-12-31', '2000-01-01');
    expect(screen.getByText('Some values are not valid.')).toBeInTheDocument();
    expect(start()).toHaveAttribute('aria-invalid', 'true');
    expect(submit()).toBeDisabled();

    fill('2100-12-31', '2101-01-01');
    expect(end()).toHaveAttribute('aria-invalid', 'true');
    expect(submit()).toBeDisabled();

    fill('2000-01-01', '2000-01-01');
    expect(screen.queryByText('Some values are not valid.')).toBeNull();
    expect(submit()).toBeEnabled();
  });
});

describe('/leaves/new submit (LV-02)', () => {
  it('sends one POST, goes to /leaves, shows the toast and the new PENDING leave', async () => {
    const api = leavesApi();
    server.use(...api.handlers);
    // Open the list first: its cached data must be refreshed after create.
    const { router, queryClient } = renderApp('/leaves');
    expect(await screen.findByText('No leaves yet.')).toBeInTheDocument();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    await userEvent.click(screen.getByRole('link', { name: 'Add' }));
    await screen.findByRole('heading', { name: 'Add new leave' });

    await userEvent.selectOptions(typeSelect(), 'Doctor visit');
    fill('2026-11-09', '2026-11-13');
    await userEvent.click(submit());

    await waitFor(() => expect(router.state.location.pathname).toBe('/leaves'));
    expect(api.posts).toEqual([
      {
        type: 'DOCTOR',
        startDate: '2026-11-09',
        endDate: '2026-11-13',
        isHalfDay: false,
      },
    ]);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['leaves'] });
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Leave created',
    );
    const row = await screen.findByRole('row', { name: /Jana Nová/ });
    expect(row).toHaveTextContent('Doctor visit');
    expect(row).toHaveTextContent('Pending');
  });

  it('invalidates the cached summary after create (SUM-01)', async () => {
    const api = leavesApi();
    let summaryCalls = 0;
    server.use(
      ...api.handlers,
      http.get('*/api/leaves/summary', () => {
        summaryCalls++;
        return HttpResponse.json({ years: [] });
      }),
    );
    const { router, queryClient } = renderApp('/summary');
    expect(await screen.findByText(/no approved leaves/i)).toBeInTheDocument();
    await act(() => router.navigate('/leaves/new'));
    await screen.findByRole('heading', { name: 'Add new leave' });
    expect(
      queryClient.getQueryState(['leaves', 'summary'])?.isInvalidated,
    ).toBe(false);
    await userEvent.click(submit());
    await waitFor(() => expect(router.state.location.pathname).toBe('/leaves'));
    expect(
      queryClient.getQueryState(['leaves', 'summary'])?.isInvalidated,
    ).toBe(true);
    const before = summaryCalls;
    await act(() => router.navigate('/summary'));
    await waitFor(() => expect(summaryCalls).toBe(before + 1));
  });

  it('refreshes the pending badge after create', async () => {
    const admin = { ...me, isAdmin: true };
    const api = leavesApi({ user: admin });
    server.use(...api.handlers);
    renderApp('/leaves/new');
    await screen.findByRole('heading', { name: 'Add new leave' });
    expect(screen.queryByLabelText('1 pending')).not.toBeInTheDocument();
    await userEvent.click(submit());
    expect(await screen.findByLabelText('1 pending')).toBeInTheDocument();
  });

  it('double click sends one request; "Saving…" and disabled while in flight', async () => {
    const { api, router } = await openForm(leavesApi({ postDelay: 150 }));
    await userEvent.dblClick(submit());
    const saving = await screen.findByRole('button', { name: 'Saving…' });
    expect(saving).toBeDisabled();
    // A form submit (e.g. Enter) while saving is ignored too.
    fireEvent.submit(saving.closest('form')!);
    await waitFor(() => expect(router.state.location.pathname).toBe('/leaves'));
    expect(api.posts).toHaveLength(1);
  });

  it.each([
    [
      'LEAVE_HALF_DAY_MULTIPLE_DAYS',
      () => error(400, 'LEAVE_HALF_DAY_MULTIPLE_DAYS'),
      'Half day option is allowed only within single day',
    ],
    [
      'LEAVE_END_BEFORE_START',
      () => error(400, 'LEAVE_END_BEFORE_START'),
      'Start date must not be greater than end date',
    ],
    [
      'LEAVE_TOO_LONG',
      () => error(400, 'LEAVE_TOO_LONG'),
      'Leave must be shorter than 2 years',
    ],
    [
      'VALIDATION_FAILED',
      () => error(400, 'VALIDATION_FAILED'),
      'Some values are not valid.',
    ],
    [
      'UNKNOWN (non-JSON 500)',
      () => new HttpResponse('boom', { status: 500 }),
      'Could not save the leave. Try again.',
    ],
    [
      'NETWORK_ERROR',
      () => HttpResponse.error(),
      'Could not save the leave. Try again.',
    ],
  ])(
    'server error %s: inline message, values kept, no toast',
    async (_, respond, message) => {
      const { router } = await openForm(leavesApi({ respond }));
      await userEvent.selectOptions(typeSelect(), 'Sick leave');
      fill('2026-11-09', '2026-11-09');
      await userEvent.click(halfDay());
      await userEvent.click(submit());

      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      expect(router.state.location.pathname).toBe('/leaves/new');
      expect(typeSelect()).toHaveValue('SICKNESS');
      expect(start()).toHaveValue('2026-11-09');
      expect(end()).toHaveValue('2026-11-09');
      expect(halfDay()).toBeChecked();
      expect(submit()).toBeEnabled();
      expect(getToasts()).toEqual([]);

      // Editing the form clears the stale server message.
      setDate(end(), '2026-11-10');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    },
  );

  it('Cancel goes to /leaves without saving', async () => {
    const { router, api } = await openForm();
    fill('2026-11-09', '2026-11-13');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(router.state.location.pathname).toBe('/leaves');
    expect(api.posts).toEqual([]);
  });

  it('renders Slovak labels, type names and messages', async () => {
    await setLanguage('sk');
    server.use(...leavesApi().handlers);
    renderApp('/leaves/new');
    await screen.findByRole('heading', { name: 'Nová neprítomnosť' });
    expect(screen.getByLabelText('Typ')).toHaveDisplayValue('Dovolenka');
    expect(screen.getByLabelText('Dátum začiatku')).toHaveValue('2026-11-10');
    expect(
      screen.getByLabelText('Počet zameškaných pracovných dní'),
    ).toHaveValue('1');
    await userEvent.click(screen.getByLabelText('Poldeň?'));
    expect(
      screen.getByLabelText('Počet zameškaných pracovných dní'),
    ).toHaveValue('0,5');
    setDate(screen.getByLabelText('Dátum konca'), '2026-11-09');
    expect(
      screen.getByText('Dátum začiatku nesmie byť neskôr ako dátum konca'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Pridať neprítomnosť' }),
    ).toBeDisabled();
    setDate(screen.getByLabelText('Dátum konca'), '');
    expect(screen.getByText('Povinné')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zrušiť' })).toBeEnabled();
    await act(() => setLanguage('en'));
    expect(screen.getByText('Required')).toBeInTheDocument();
  });
});
