import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from '../users/users.module';
import { AuditLog, AuditLogSchema } from './audit-log.schema';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';

/** NFR-06 audit log: `AuditService.record` for writers, admin read API. */
@Module({
  imports: [
    UsersModule,
    MongooseModule.forFeature([
      { name: AuditLog.name, schema: AuditLogSchema },
    ]),
  ],
  controllers: [AuditController],
  providers: [AuditService],
  // The AuditLog model is read (never written) by the NFR-07 export.
  exports: [AuditService, MongooseModule],
})
export class AuditModule {}
