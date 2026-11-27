import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APPROVED_CHANGES } from './classify.mts';
import type { AppResponse, Diff } from './compare.mts';
import {
  actionClass,
  decisionMail,
  diffActions,
  diffMails,
  extraMailClass,
  mailDate,
  mailView,
  NEW_PENDING_HEADING,
  OLD_PENDING_HEADING,
  parseNewAction,
  parseOldAction,
  pendingMailClass,
  rejectedCreateMailClass,
  resultFieldClass,
  scenario,
  type Step,
  TYPE_LABELS_EN,
} from './scenarios.mts';

const res = (status: number, body: unknown = ''): AppResponse => ({
  kind: 'response',
  status,
  contentType: 'application/json',
  acao: null,
  body: typeof body === 'string' ? body : JSON.stringify(body),
  ms: 1,
});

const BASE = 'https://parity.example.test';

/** Old `mailService.js` body for a new leave. */
const OLD_PENDING_HTML =
  '<h4>New leave was created and need to be approved.</h4>' +
  '<b>Requester: </b> Boris Biely<br>' +
  '<b>Days: </b>Monday, Nov 9, 2026 - Friday, Nov 13, 2026<br>' +
  '<b>Type: </b>ANNUAL<br>' +
  `<a href="${BASE}/leaves/approval">Approve</a>`;

/** New NOT-02 body (same leave). */
const NEW_PENDING_HTML = `<h4>New leave was created and needs to be approved.</h4>
<b>Requester: </b> Boris Biely<br>
<b>Days: </b>Monday, Nov 9, 2026 - Friday, Nov 13, 2026<br>
<b>Type: </b>Annual leave<br>
<a href="${BASE}/approval">Approve</a>`;

const pending = (html: string) =>
  mailView(['Approver@Example.test'], 'New leave notification', html);

describe('write-scenario answers (MIG-03)', () => {
  it('reads the old mutation answers like the old client', () => {
    expect(
      parseOldAction(
        'create',
        res(200, { data: { createLeave: { id: 'x' } } }),
      ),
    ).toEqual({ kind: 'ok', result: { id: 'x' } });
    expect(
      parseOldAction('delete', res(200, { data: { removeLeave: null } })),
    ).toEqual({ kind: 'refused', detail: 'null' });
    expect(
      parseOldAction(
        'delete',
        res(200, { data: { removeLeave: { success: true } } }),
      ),
    ).toEqual({ kind: 'ok', result: {} });
    expect(
      parseOldAction(
        'approve',
        res(200, {
          errors: [
            { message: 'Cannot return null for non-nullable field Leave.id.' },
          ],
          data: { approveLeave: null },
        }),
      ).kind,
    ).toBe('phantom');
    expect(
      parseOldAction(
        'approve',
        res(200, {
          data: {
            approveLeave: {
              id: 'x',
              state: 'APPROVED',
              approver: { id: '1', email: 'a@b', firstName: 'A', surname: 'B' },
            },
          },
        }),
      ),
    ).toEqual({
      kind: 'ok',
      result: {
        id: 'x',
        state: 'APPROVED',
        approver: { id: '1', firstName: 'A', surname: 'B', email: 'a@b' },
      },
    });
  });

  it('reports the approver email only the old answer carried as USER_EMAIL_REMOVED', () => {
    const approver = { id: '1', firstName: 'A', surname: 'B' };
    const diffs = diffActions(
      {
        kind: 'ok',
        result: {
          id: 'x',
          state: 'APPROVED',
          approver: { ...approver, email: 'a@b' },
        },
      },
      { kind: 'ok', result: { id: 'x', state: 'APPROVED', approver } },
      (_, id) => id,
    );
    expect(diffs.map((d) => [d.path, resultFieldClass(d)])).toEqual([
      ['$result.approver.email', 'USER_EMAIL_REMOVED'],
    ]);
    // Any other field difference stays unexplained.
    const other = diffActions(
      { kind: 'ok', result: { id: 'x', state: 'APPROVED', approver } },
      {
        kind: 'ok',
        result: {
          id: 'x',
          state: 'APPROVED',
          approver: { ...approver, surname: 'C' },
        },
      },
      (_, id) => id,
    );
    expect(other.map((d) => resultFieldClass(d))).toEqual([null]);
  });

  it('reads the new answers, refusals with their code', () => {
    expect(parseNewAction('delete', res(204))).toEqual({
      kind: 'ok',
      result: {},
    });
    expect(parseNewAction('create', res(201, { id: 'y' }))).toEqual({
      kind: 'ok',
      result: { id: 'y' },
    });
    expect(
      parseNewAction(
        'approve',
        res(403, { statusCode: 403, code: 'FORBIDDEN' }),
      ),
    ).toEqual({ kind: 'refused', detail: '403 FORBIDDEN' });
    expect(parseNewAction('approve', res(500, { message: 'x' })).kind).toBe(
      'other',
    );
  });

  it('compares decided leaves by alias, state and approver', () => {
    const approver = { id: '1', firstName: 'A', surname: 'B' };
    const alias = (side: 'old' | 'new', id: string) =>
      side === 'old' ? (id === 'o1' ? '@u1' : id) : id === 'n1' ? '@u1' : id;
    expect(
      diffActions(
        { kind: 'ok', result: { id: 'o1', state: 'APPROVED', approver } },
        { kind: 'ok', result: { id: 'n1', state: 'APPROVED', approver } },
        alias,
      ),
    ).toEqual([]);
    expect(
      diffActions(
        { kind: 'ok', result: { id: 'o1', state: 'APPROVED', approver } },
        { kind: 'ok', result: { id: 'n1', state: 'REJECTED', approver } },
        alias,
      ),
    ).toEqual([
      {
        kind: 'value',
        path: '$result.state',
        old: 'APPROVED',
        new: 'REJECTED',
      },
    ]);
  });

  it("excuses an outcome diff only for the step's exact predicted answer", () => {
    const step: Step = {
      label: 's',
      actor: '2',
      action: { kind: 'approve', target: { alias: 'u1' } },
      change: {
        class: 'DENIED_EXPLICIT_ERROR',
        status: 403,
        code: 'FORBIDDEN',
      },
    };
    const oldNull = { kind: 'refused', detail: 'null' } as const;
    expect(
      actionClass(step, oldNull, { kind: 'refused', detail: '403 FORBIDDEN' }),
    ).toBe('DENIED_EXPLICIT_ERROR');
    expect(
      actionClass(step, oldNull, {
        kind: 'refused',
        detail: '404 LEAVE_NOT_FOUND',
      }),
    ).toBeNull();
    // The old app must show the old behavior (here: a silent null).
    expect(
      actionClass(
        step,
        { kind: 'ok', result: {} },
        {
          kind: 'refused',
          detail: '403 FORBIDDEN',
        },
      ),
    ).toBeNull();
    expect(
      actionClass({ ...step, change: undefined }, oldNull, {
        kind: 'refused',
        detail: '403 FORBIDDEN',
      }),
    ).toBeNull();
  });
});

describe('write-scenario emails (MIG-03)', () => {
  it('parses an email into recipients, heading, fields and link', () => {
    expect(pending(OLD_PENDING_HTML)).toEqual({
      to: ['approver@example.test'],
      subject: 'New leave notification',
      heading: OLD_PENDING_HEADING,
      fields: {
        Requester: 'Boris Biely',
        Days: 'Monday, Nov 9, 2026 - Friday, Nov 13, 2026',
        Type: 'ANNUAL',
      },
      link: { text: 'Approve', href: `${BASE}/leaves/approval` },
    });
  });

  it('excuses exactly the three §10 #14 wording changes, nothing else', () => {
    const diffs = diffMails(
      [pending(OLD_PENDING_HTML)],
      [pending(NEW_PENDING_HTML)],
    );
    expect(
      diffs.map((d) => [
        d.path.split('.').slice(-2).join('.'),
        pendingMailClass(d, BASE),
      ]),
    ).toEqual([
      ['test.heading', 'NEW_LEAVE_EMAIL_WORDING'],
      ['fields.Type', 'NEW_LEAVE_EMAIL_WORDING'],
      ['link.href', 'NEW_LEAVE_EMAIL_WORDING'],
    ]);
    expect(NEW_PENDING_HEADING).not.toBe(OLD_PENDING_HEADING);
    // A wrong label, or a changed requester, stays unexplained.
    const wrong = diffMails(
      [pending(OLD_PENDING_HTML)],
      [
        pending(
          NEW_PENDING_HTML.replace('Annual leave', 'Doctor visit').replace(
            'Boris Biely',
            'Boris B.',
          ),
        ),
      ],
    );
    const unexplained = wrong.filter((d) => !pendingMailClass(d, BASE));
    expect(
      unexplained.map((d) => d.path.split('.').slice(-2).join('.')),
    ).toEqual(['fields.Requester', 'fields.Type']);
  });

  it('excuses a new email only when it is exactly the predicted NOT-03 email', () => {
    const predicted = decisionMail({
      decision: 'approve',
      leave: { startDate: '2026-11-09', endDate: '2026-11-13', type: 'ANNUAL' },
      requesterEmail: 'Boris.Biely@instea.co',
      admin: { firstName: 'Anna', surname: 'Nováková' },
      baseUrl: BASE,
    });
    const sent = mailView(
      ['boris.biely@instea.co'],
      'Your leave was approved',
      `<h4>Your leave was approved.</h4>
<b>Days: </b>Monday, Nov 9, 2026 - Friday, Nov 13, 2026<br>
<b>Type: </b>Annual leave<br>
<b>Approved by: </b>Anna Nováková<br>
<a href="${BASE}/leaves">Open leaves</a>`,
    );
    const [extra] = diffMails([], [sent]);
    expect(extraMailClass(extra!, predicted)).toBe('REQUESTER_DECISION_EMAIL');
    expect(extraMailClass(extra!, null)).toBeNull();
    const [other] = diffMails(
      [],
      [{ ...sent, fields: { ...sent.fields, Type: 'Sick leave' } }],
    );
    expect(extraMailClass(other!, predicted)).toBeNull();
  });

  it("excuses a missing new-leave email only for the refused leave's own email", () => {
    const [missing] = diffMails([pending(OLD_PENDING_HTML)], []) as [Diff];
    const refused = {
      requester: 'Boris Biely',
      startDate: '2026-11-09',
      endDate: '2026-11-13',
    };
    expect(rejectedCreateMailClass(missing, refused)).toBe(
      'VALIDATION_REJECTED',
    );
    expect(
      rejectedCreateMailClass(missing, { ...refused, endDate: '2026-11-12' }),
    ).toBeNull();
    expect(rejectedCreateMailClass(missing, null)).toBeNull();
  });

  it('formats days like the old email (dddd, MMM D, YYYY)', () => {
    expect(mailDate('2026-11-09')).toBe('Monday, Nov 9, 2026');
    expect(mailDate('2026-12-01')).toBe('Tuesday, Dec 1, 2026');
  });

  it('uses the English type labels of functional spec §4', () => {
    const spec = readFileSync(
      join(__dirname, '../../../../docs/functional-spec.md'),
      'utf8',
    );
    const section = spec.slice(spec.indexOf('## 4. Leave types'));
    const rows: Record<string, string> = Object.fromEntries(
      [...section.matchAll(/^\| `([A-Z]+)` \| ([^|]+) \|/gm)]
        .map((m): [string, string] => [m[1]!, m[2]!.trim()])
        .filter(([code]) => code in TYPE_LABELS_EN),
    );
    expect(rows).toEqual(TYPE_LABELS_EN);
  });
});

describe('write scenario (MIG-03)', () => {
  it('drops the steps of roles the dataset lacks, and names approved changes only', () => {
    const full = scenario({
      admin: '1',
      user: '2',
      other: '3',
      unapproved: '4',
      removed: '9',
    });
    const minimal = scenario({ admin: '1', user: '2', other: '3' });
    expect(full.length - minimal.length).toBe(2);
    for (const s of full)
      if (s.change)
        expect(Object.keys(APPROVED_CHANGES)).toContain(s.change.class);
  });
});
