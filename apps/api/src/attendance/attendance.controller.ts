import {
  type CanActivate,
  Controller,
  type ExecutionContext,
  Get,
  Inject,
  Injectable,
  Req,
  Res,
  UseFilters,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { M2M } from '../auth/access.decorator';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/env.schema';
import { ref } from '../docs/schemas';
import { type AttendancePeriod, attendancePeriod } from './attendance.assembly';
import {
  AttendanceExceptionFilter,
  AttendanceParamError,
  INTERNAL_ERROR_MESSAGE,
  M2mUnauthorizedError,
  sendJson,
} from './attendance.errors';
import { AttendanceService } from './attendance.service';
import { SsoUnavailableError } from './sso/sso.client';
import { TogglUnavailableError } from './toggl/toggl.client';
import { m2mCredentialsMatch, parseBasicAuth } from './m2m-auth';

/**
 * ATT-01 guard: the only route behind M2M Basic auth. Any failure → 401
 * with an empty body (`AttendanceExceptionFilter`).
 */
@Injectable()
export class M2mBasicAuthGuard implements CanActivate {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const ok = m2mCredentialsMatch(
      {
        username: this.config.M2M_USERNAME,
        password: this.config.M2M_PASSWORD,
      },
      parseBasicAuth(request.headers.authorization),
    );
    if (!ok) throw new M2mUnauthorizedError();
    return true;
  }
}

/** The whole month (first and last day) fits the JS `Date` range. */
function isSupportedMonth(year: number, month: number): boolean {
  return (
    Number.isFinite(Date.UTC(year, month - 1, 1)) &&
    Number.isFinite(Date.UTC(year, month, 0))
  );
}

/**
 * Old param validation: month first, then year; `Number(param)` must be a
 * finite number (`''` and `' '` are 0 and valid, like old `isNaN`). The
 * non-finite check (`Infinity`, `1e400`) is a safe fix. Also a safe fix:
 * a finite value whose effective month lies outside the JS `Date` range
 * (old: `Invalid date`) is a 400 too — the year message when the year
 * alone is out of range (`1e20/3`), else the month message (`2024/1e300`).
 */
export function parseAttendanceParams(
  year: string,
  month: string,
): AttendancePeriod {
  const m = Number(month);
  if (!Number.isFinite(m)) {
    throw new AttendanceParamError(AttendanceParamError.MONTH);
  }
  const y = Number(year);
  if (!Number.isFinite(y) || !isSupportedMonth(Math.trunc(y), 1)) {
    throw new AttendanceParamError(AttendanceParamError.YEAR);
  }
  const period = attendancePeriod(y, m);
  if (!isSupportedMonth(period.year, period.month)) {
    throw new AttendanceParamError(AttendanceParamError.MONTH);
  }
  return period;
}

/**
 * `GET /api/attendence/:year/:month` (path spelling kept), 1:1 contract
 * with the old Express handler. `@M2M()` (NFR-01): the access-token guard
 * is skipped, so a Bearer token does not authenticate here, and Basic
 * credentials authenticate nowhere else.
 * Responses are written directly so the bytes equal `JSON.stringify` of
 * the ATT-04 object; no CORS headers (see `app.setup.ts`).
 * DOC-02: documented with the old contract (`m2mBasic` security from the
 * `@M2M` access level; no `ErrorBody`).
 */
@ApiTags('attendance')
@M2M(M2mBasicAuthGuard)
@UseFilters(AttendanceExceptionFilter)
@Controller('api/attendence')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get(':year/:month')
  @ApiOperation({
    summary: 'Monthly attendance',
    description: [
      'Logged Toggl hours and approved leave codes per employee and day for one ' +
        'month (old contract kept 1:1, incl. the `attendence` spelling).',
      '',
      'Params are parsed like the old app: any finite number (month checked ' +
        'first); a month outside 1–12 rolls over (`2024/13` = January 2025, ' +
        '`2024/0` = December 2023) and then carries no leave codes. A finite ' +
        'value whose month lies outside the JS `Date` range is a 400 with the ' +
        'old texts: `Year is not a number.` when the year alone is out of range ' +
        '(`1e20/3`), else `Month is not a number.` (`2024/1e300`).',
      '',
      'Errors use the old bodies, not `ErrorBody`: 400 / 500 `{ "message": ... }`; ' +
        '401 (missing or wrong Basic credentials, also with a Bearer token) has ' +
        'an empty body and no `WWW-Authenticate` header. No CORS headers.',
      '',
      'Exception: like every route, a JSON request body is parsed before ' +
        'routing and authentication, and its errors answer with the app-wide ' +
        '`ErrorBody`: 400 `VALIDATION_FAILED` (malformed JSON, unsupported ' +
        'charset or content encoding) and 403 `PAYLOAD_TOO_LARGE` (over 100 KB). ' +
        'So a 400 body is `AttendanceError` or `ErrorBody`.',
    ].join('\n'),
  })
  // Stacked decorators list bottom-up: year first.
  @ApiParam({
    name: 'month',
    description:
      'Month 1–12, e.g. `12`. Other finite numbers roll over; one whose month ' +
      'falls outside the JS `Date` range is 400 `Month is not a number.`.',
    schema: { type: 'string' },
    example: '12',
  })
  @ApiParam({
    name: 'year',
    description:
      'Year, e.g. `2026`: a finite number within the JS `Date` range, else ' +
      '400 `Year is not a number.`.',
    schema: { type: 'string' },
    example: '2026',
  })
  @ApiResponse({
    status: 200,
    description: 'Attendance of all employees listed in the SSO directory.',
    content: {
      'application/json': {
        schema: ref('AttendanceResponse'),
        example: {
          start: '2026-12-01',
          end: '2026-12-31',
          attendence: {
            'Eva Dvořák': {
              days: [
                { logged_time: 7.5, leave: '' },
                { logged_time: 0, leave: 'D8' },
                { logged_time: 4, leave: 'D4' },
              ],
              total: 11.5,
              contractType: 'TPP',
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description:
      'A param is not a finite number or lies outside the JS `Date` range ' +
      '(month checked first).',
    content: {
      'application/json': {
        schema: ref('AttendanceError'),
        examples: {
          month: {
            summary: 'Invalid month',
            value: { message: AttendanceParamError.MONTH },
          },
          year: {
            summary: 'Invalid year',
            value: { message: AttendanceParamError.YEAR },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description:
      'Missing or wrong M2M Basic credentials: empty body, no `WWW-Authenticate`.',
  })
  @ApiResponse({
    status: 500,
    description: 'SSO or Toggl not reachable, or an unexpected failure.',
    content: {
      'application/json': {
        schema: ref('AttendanceError'),
        examples: {
          sso: {
            summary: 'SSO directory not reachable',
            value: { message: SsoUnavailableError.MESSAGE },
          },
          toggl: {
            summary: 'Toggl not reachable',
            value: { message: TogglUnavailableError.MESSAGE },
          },
          internal: {
            summary: 'Unexpected failure',
            value: { message: INTERNAL_ERROR_MESSAGE },
          },
        },
      },
    },
  })
  async get(@Req() req: Request, @Res() res: Response): Promise<void> {
    const { year, month } = req.params as { year: string; month: string };
    const period = parseAttendanceParams(year, month);
    sendJson(res, 200, await this.attendance.build(period));
  }
}
