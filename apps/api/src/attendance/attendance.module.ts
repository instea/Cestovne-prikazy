import { Module } from '@nestjs/common';
import { LeavesModule } from '../leaves/leaves.module';
import { UsersModule } from '../users/users.module';
import { AttendanceService } from './attendance.service';
import { SsoModule } from './sso/sso.module';
import { TogglModule } from './toggl/toggl.module';

/** ATT-04 assembly; TODO(ATT-01): the M2M controller joins this module. */
@Module({
  imports: [SsoModule, TogglModule, UsersModule, LeavesModule],
  providers: [AttendanceService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
