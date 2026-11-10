import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { LeavesModule } from '../leaves/leaves.module';
import { UserExportController } from './user-export.controller';
import { UserExportService } from './user-export.service';
import { UsersController } from './users.controller';
import { UsersModule } from './users.module';
import { UsersService } from './users.service';

/**
 * `/api/users` endpoints (USR-01..04) and the NFR-07 GDPR export
 * (`/api/admin/users/:id/export`). Separate from `UsersModule` (the User
 * model), which `AuditModule` itself imports.
 */
@Module({
  imports: [UsersModule, AuditModule, AuthModule, LeavesModule],
  controllers: [UsersController, UserExportController],
  providers: [UsersService, UserExportService],
})
export class UsersApiModule {}
