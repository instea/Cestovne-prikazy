/** API data transfer objects shared by api and web. Dates are ISO-8601 strings. */

import type { IsoDate, LeaveState, LeaveType } from './leaves.js';

/** DATA-01 `UserDto`. */
export interface UserDto {
  id: string;
  email: string;
  firstName: string;
  surname: string;
  isAdmin: boolean;
  active: boolean;
  deactivatedAt: string | null;
  anonymizedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * DATA-01 `UserRefDto`: a user embedded in another DTO (e.g. `requester` /
 * `approver` of a leave). Never carries the email.
 */
export interface UserRefDto {
  id: string;
  firstName: string;
  surname: string;
  active: boolean;
  anonymized: boolean;
}

/**
 * DATA-02 `LeaveDto`: response shape of every leave endpoint. Dates are
 * calendar dates (`YYYY-MM-DD`); `createdAt` / `updatedAt` are ISO-8601.
 * `requester` / `approver` are `null` when the user is missing (defensive);
 * `approver` is `null` before the first approve / reject.
 */
export interface LeaveDto {
  id: string;
  requester: UserRefDto | null;
  approver: UserRefDto | null;
  startDate: IsoDate;
  endDate: IsoDate;
  isHalfDay: boolean;
  type: LeaveType;
  state: LeaveState;
  numDays: number;
  createdAt: string;
  updatedAt: string;
}

/** AUTH-01 / AUTH-02 session response (login and refresh). */
export interface SessionDto {
  accessToken: string;
  accessTokenExpiresAt: string;
  user: UserDto;
}

/** AUTH-01 `GET /api/auth/config`. */
export interface AuthConfigDto {
  googleClientId: string;
  hostedDomain: string;
}
