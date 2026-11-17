import { Module } from '@nestjs/common';
import { LeavesModule } from '../leaves/leaves.module';
import { UsersModule } from '../users/users.module';
import {
  AttendanceController,
  M2mBasicAuthGuard,
} from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { SsoModule } from './sso/sso.module';
import { TogglModule } from './toggl/toggl.module';

/** ATT-01 M2M endpoint and ATT-04 assembly. */
@Module({
  imports: [SsoModule, TogglModule, UsersModule, LeavesModule],
  controllers: [AttendanceController],
  providers: [AttendanceService, M2mBasicAuthGuard],
  exports: [AttendanceService],
})
export class AttendanceModule {}
