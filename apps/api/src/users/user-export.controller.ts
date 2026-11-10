import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../auth/access.decorator';
import { type AuthUser, CurrentUser } from '../auth/auth-user';
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
    @Res({ passthrough: true }) res: Response,
  ): Promise<UserExportFile> {
    const { fileName, file } = await this.exports.export(caller.id, id);
    res.set({
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'no-store',
    });
    return file;
  }
}
