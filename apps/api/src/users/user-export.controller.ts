import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import { ErrorCode } from '@leaves/shared/enums';
import type { Request, Response } from 'express';
import { Roles } from '../auth/access.decorator';
import { type AuthUser, CurrentUser } from '../auth/auth-user';
import { AppException } from '../common/app-exception';
import type { UserExportFile } from './user-export';
import { UserExportService } from './user-export.service';

/** NFR-07: admin-only GDPR export of one user's data as a JSON download. */
@Controller('api/admin/users')
export class UserExportController {
  constructor(private readonly exports: UserExportService) {}

  @Roles('admin')
  @Get(':id/export')
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
