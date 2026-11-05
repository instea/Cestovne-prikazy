import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Leave, LeaveSchema } from './leave.schema';

/** DATA-02: registers the Leave model. Endpoints come with LV-* / LST-*. */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Leave.name, schema: LeaveSchema }]),
  ],
  exports: [MongooseModule],
})
export class LeavesModule {}
