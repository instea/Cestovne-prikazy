import { Module } from '@nestjs/common';
import { SsoModule } from '../attendance/sso/sso.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { LeavesModule } from '../leaves/leaves.module';
import { UserAnonymizationController } from './user-anonymization.controller';
import { UserAnonymizationService } from './user-anonymization.service';
import { UserExportController } from './user-export.controller';
import { UserExportService } from './user-export.service';
import { UsersController } from './users.controller';
import { UsersModule } from './users.module';
import { UsersService } from './users.service';

/**
 * `/api/users` endpoints (USR-01..04), the NFR-07 GDPR export
 * (`/api/admin/users/:id/export`) and the NFR-08 anonymization
 * (`/api/admin/users/:id/anonymize`). Separate from `UsersModule` (the User
 * model), which `AuditModule` itself imports.
 */
@Module({
  imports: [UsersModule, AuditModule, AuthModule, LeavesModule, SsoModule],
  controllers: [
    UsersController,
    UserExportController,
    UserAnonymizationController,
  ],
  providers: [UsersService, UserExportService, UserAnonymizationService],
})
export class UsersApiModule {}
