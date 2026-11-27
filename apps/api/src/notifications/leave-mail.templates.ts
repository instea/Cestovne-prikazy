import { LEAVE_TYPE_LABELS_EN, LeaveState } from '@leaves/shared/leaves';
import type { IsoDate, LeaveType } from '@leaves/shared/leaves';
import { format } from 'date-fns';
import { enUS } from 'date-fns/locale';
// Aliased: Prettier would reformat an `html` tagged template as HTML,
// changing the exact email markup.
import { html as markup } from '../mail/html';

/**
 * NOT-02 / NOT-03 email templates (English only, NFR-14). Pure functions:
 * the notifier service decides whether and to whom to send.
 */

export const LEAVE_CREATED_TEMPLATE = 'leave-created';
export const LEAVE_APPROVED_TEMPLATE = 'leave-approved';
export const LEAVE_REJECTED_TEMPLATE = 'leave-rejected';

export interface RenderedMail {
  subject: string;
  html: string;
}

/** The leave fields the templates print. */
export interface MailLeave {
  startDate: IsoDate;
  endDate: IsoDate;
  type: LeaveType;
}

/** A person named in a template. */
export interface MailPerson {
  firstName: string;
  surname: string;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * `EEEE, MMM d, yyyy` (en-US) of a calendar date, e.g. `Monday, Dec 21, 2026`.
 * The date is formatted as-is: no timezone can shift it (unlike old, which
 * formatted instants in `DEFAULT_TIMEZONE`).
 */
export function formatMailDate(date: IsoDate): string {
  const m = ISO_DATE.exec(date);
  if (!m) throw new RangeError(`Invalid date: ${JSON.stringify(date)}`);
  // Local noon: never moved to another day by a DST gap at midnight.
  const local = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  local.setFullYear(Number(m[1]));
  return format(local, 'EEEE, MMM d, yyyy', { locale: enUS });
}

/**
 * `BASE_URL` without trailing slashes plus `path`. Empty `BASE_URL` gives
 * the relative `path` (old fallback).
 */
export function appUrl(baseUrl: string, path: `/${string}`): string {
  return `${baseUrl.replace(/\/+$/, '')}${path}`;
}

/** NOT-02: new leave → approver. */
export function renderLeaveCreated(
  leave: MailLeave,
  requester: MailPerson,
  baseUrl: string,
): RenderedMail {
  const body = markup`<h4>New leave was created and needs to be approved.</h4>
<b>Requester: </b> ${requester.firstName} ${requester.surname}<br>
<b>Days: </b>${formatMailDate(leave.startDate)} - ${formatMailDate(leave.endDate)}<br>
<b>Type: </b>${LEAVE_TYPE_LABELS_EN[leave.type]}<br>
<a href="${appUrl(baseUrl, '/approval')}">Approve</a>`;
  return { subject: 'New leave notification', html: body.toString() };
}

export type LeaveDecision = LeaveState.APPROVED | LeaveState.REJECTED;

/** NOT-03: approved / rejected → requester. */
export function renderLeaveDecided(
  decision: LeaveDecision,
  leave: MailLeave,
  admin: MailPerson,
  baseUrl: string,
): RenderedMail {
  const approved = decision === LeaveState.APPROVED;
  const word = approved ? 'approved' : 'rejected';
  const by = approved ? 'Approved by: ' : 'Rejected by: ';
  const body = markup`<h4>Your leave was ${word}.</h4>
<b>Days: </b>${formatMailDate(leave.startDate)} - ${formatMailDate(leave.endDate)}<br>
<b>Type: </b>${LEAVE_TYPE_LABELS_EN[leave.type]}<br>
<b>${by}</b>${admin.firstName} ${admin.surname}<br>
<a href="${appUrl(baseUrl, '/leaves')}">Open leaves</a>`;
  return { subject: `Your leave was ${word}`, html: body.toString() };
}

export function decisionTemplate(decision: LeaveDecision): string {
  return decision === LeaveState.APPROVED
    ? LEAVE_APPROVED_TEMPLATE
    : LEAVE_REJECTED_TEMPLATE;
}

/** The requester fields the NOT-03 send rule reads. */
export interface DecisionRecipient {
  active: boolean;
  anonymizedAt: Date | null;
}

/** NOT-03: the requester can receive mail (not deactivated, not anonymized). */
export function isReachable(requester: DecisionRecipient): boolean {
  return requester.active && requester.anonymizedAt == null;
}

/** NOT-03: a decision changed the state (approve / reject only). */
export function isStateChange(
  previousState: LeaveState,
  newState: LeaveState,
): newState is LeaveDecision {
  return newState !== LeaveState.PENDING && previousState !== newState;
}

/**
 * NOT-03 send rule: only a real state change to APPROVED / REJECTED (a
 * same-state re-approve / re-reject sends nothing), and only to an active,
 * non-anonymized requester.
 */
export function shouldNotify(
  previousState: LeaveState,
  newState: LeaveState,
  requester: DecisionRecipient,
): boolean {
  return isStateChange(previousState, newState) && isReachable(requester);
}
