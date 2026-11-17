import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { LeaveNotificationsService } from './leave-notifications.service';

/** NOT-02 / NOT-03; imported by the leave (LV-01) and approval (APR-01) modules. */
@Module({
  imports: [MailModule],
  providers: [LeaveNotificationsService],
  exports: [LeaveNotificationsService],
})
export class NotificationsModule {}
