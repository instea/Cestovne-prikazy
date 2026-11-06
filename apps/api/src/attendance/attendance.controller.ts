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
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../auth/public.decorator';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/env.schema';
import { type AttendancePeriod, attendancePeriod } from './attendance.assembly';
import {
  AttendanceExceptionFilter,
  AttendanceParamError,
  M2mUnauthorizedError,
  sendJson,
} from './attendance.errors';
import { AttendanceService } from './attendance.service';
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

/**
 * Old param validation: month first, then year; `Number(param)` must be a
 * finite number (`''` and `' '` are 0 and valid, like old `isNaN`). The
 * non-finite check (`Infinity`, `1e400`) is a safe fix.
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
  if (!Number.isFinite(y)) {
    throw new AttendanceParamError(AttendanceParamError.YEAR);
  }
  return attendancePeriod(y, m);
}

/**
 * `GET /api/attendence/:year/:month` (path spelling kept), 1:1 contract
 * with the old Express handler. `@Public()` for the access-token guard: a
 * Bearer token does not authenticate here, Basic credentials nowhere else.
 * Responses are written directly so the bytes equal `JSON.stringify` of
 * the ATT-04 object; no CORS headers (see `app.setup.ts`).
 * TODO(DOC-02): OpenAPI entry with an `http`/`basic` security scheme.
 */
@Public()
@UseGuards(M2mBasicAuthGuard)
@UseFilters(AttendanceExceptionFilter)
@Controller('api/attendence')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get(':year/:month')
  async get(@Req() req: Request, @Res() res: Response): Promise<void> {
    const { year, month } = req.params as { year: string; month: string };
    const period = parseAttendanceParams(year, month);
    sendJson(res, 200, await this.attendance.build(period));
  }
}
