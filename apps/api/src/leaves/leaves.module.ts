import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { Leave, LeaveSchema } from './leave.schema';
import { LeavesController } from './leaves.controller';
import { LeavesService } from './leaves.service';

/** DATA-02 Leave model; LV-01 create, LST-01 list, SUM-01 summary. */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Leave.name, schema: LeaveSchema }]),
    UsersModule,
    AuditModule,
    NotificationsModule,
  ],
  controllers: [LeavesController],
  providers: [LeavesService],
  exports: [MongooseModule],
})
export class LeavesModule {}
