import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import type { LeaveState } from '@leaves/shared/leaves';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/env.schema';
import { MailService } from '../mail/mail.service';
import {
  decisionTemplate,
  isReachable,
  isStateChange,
  LEAVE_CREATED_TEMPLATE,
  type DecisionRecipient,
  type MailLeave,
  type MailPerson,
  renderLeaveCreated,
  renderLeaveDecided,
} from './leave-mail.templates';

/** The leave fields the notifications need. */
export interface NotifiedLeave extends MailLeave {
  id: string;
}

export type NotifiedRequester = MailPerson &
  DecisionRecipient & { email: string };

/**
 * NOT-02 / NOT-03 notifier. Fire-and-forget through `MailService` (NOT-01):
 * methods return at once and never throw into the business operation. Call
 * only after the DB change (and its audit transaction, NFR-06) committed.
 */
@Injectable()
export class LeaveNotificationsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(LeaveNotificationsService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly mail: MailService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.BASE_URL) {
      this.logger.warn('BASE_URL is not set; email links will be relative');
    }
  }

  /**
   * NOT-02: one email to `APPROVAL_MAIL_RECEIVER` after a leave was created.
   * Called by LV-01 after the create transaction commits.
   */
  leaveCreated(leave: NotifiedLeave, requester: MailPerson): void {
    this.guard(() => {
      const to = this.config.APPROVAL_MAIL_RECEIVER;
      const context = { template: LEAVE_CREATED_TEMPLATE, leaveId: leave.id };
      if (!to) {
        this.logger.warn(
          `Email not sent: APPROVAL_MAIL_RECEIVER is not set (template=${context.template}, leaveId=${leave.id})`,
        );
        return;
      }
      const mail = renderLeaveCreated(leave, requester, this.config.BASE_URL);
      this.mail.send({ to, ...mail, context });
    });
  }

  /**
   * NOT-03: email to the requester after an approve / reject that changed
   * the state. Same-state calls send nothing (silently); an inactive or
   * anonymized requester gets nothing (info line).
   * Called by APR-01 after the approve / reject transaction commits.
   */
  leaveDecided(
    leave: NotifiedLeave,
    previousState: LeaveState,
    newState: LeaveState,
    requester: NotifiedRequester,
    admin: MailPerson,
  ): void {
    this.guard(() => {
      if (!isStateChange(previousState, newState)) return;
      const template = decisionTemplate(newState);
      if (!isReachable(requester)) {
        this.logger.log(
          `Email not sent: requester inactive (template=${template}, leaveId=${leave.id})`,
        );
        return;
      }
      const mail = renderLeaveDecided(
        newState,
        leave,
        admin,
        this.config.BASE_URL,
      );
      this.mail.send({
        to: requester.email,
        ...mail,
        context: { template, leaveId: leave.id },
      });
    });
  }

  /** A template or logging failure must not fail the business operation. */
  private guard(run: () => void): void {
    try {
      run();
    } catch (e) {
      try {
        this.logger.error(
          `Email not sent: ${e instanceof Error ? e.message : String(e)}`,
        );
      } catch {
        // Nothing left to report to.
      }
    }
  }
}
