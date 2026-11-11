import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import { ErrorCode } from '@leaves/shared/enums';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Roles } from '../auth/access.decorator';
import { type AuthUser, CurrentUser } from '../auth/auth-user';
import { AppException } from '../common/app-exception';
import { ApiErrors } from '../docs/api-errors';
import { ApiJsonResponse } from '../docs/api-responses';
import { ApiHeadOperation } from '../docs/openapi';
import type { UserExportFile } from './user-export';
import { UserExportService } from './user-export.service';

/** NFR-07: admin-only GDPR export of one user's data as a JSON download. */
@ApiTags('gdpr')
@Controller('api/admin/users')
export class UserExportController {
  constructor(private readonly exports: UserExportService) {}

  @Roles('admin')
  @Get(':id/export')
  @ApiOperation({
    summary: "Export a user's data",
    description:
      'GDPR export: the user, their leaves (as requester and approver) and the ' +
      'audit entries about them, as a JSON download. Writes `USER_DATA_EXPORTED`.',
  })
  @ApiJsonResponse(200, 'UserExportFile', {
    description: 'The export file.',
    headers: {
      'Content-Disposition': {
        description: '`attachment; filename="<file name>.json"`',
        schema: { type: 'string' },
      },
    },
  })
  @ApiErrors([404, ErrorCode.USER_NOT_FOUND])
  @ApiHeadOperation({
    summary: 'HEAD is refused',
    description:
      'HEAD would build the file and write the audit entry, so it is refused ' +
      'after the access checks with 405 and `Allow: GET`.',
    errors: [[405, ErrorCode.METHOD_NOT_ALLOWED]],
    allow: 'GET',
  })
  async export(
    @CurrentUser() caller: AuthUser,
    @Param('id') id: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<UserExportFile> {
    // Express answers HEAD with the GET handler: refuse it (after the access
    // guards) so a HEAD never builds the file or writes USER_DATA_EXPORTED
    // (user decision 2026-11-11).
    if (req.method === 'HEAD') {
      res.set('Allow', 'GET');
      throw new AppException(
        405,
        ErrorCode.METHOD_NOT_ALLOWED,
        'Method not allowed',
      );
    }
    const { fileName, file } = await this.exports.export(caller.id, id);
    res.set({
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'no-store',
    });
    return file;
  }
}
