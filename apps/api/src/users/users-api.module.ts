import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { UsersController } from './users.controller';
import { UsersModule } from './users.module';
import { UsersService } from './users.service';

/**
 * `/api/users` endpoints (USR-01, USR-03). Separate from `UsersModule`
 * (the User model), which `AuditModule` itself imports.
 */
@Module({
  imports: [UsersModule, AuditModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersApiModule {}
