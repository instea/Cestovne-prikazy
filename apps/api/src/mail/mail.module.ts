import { Module } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import { APP_CONFIG } from '../config/config.module';
import { type AppConfig, isSmtpConfigured } from '../config/env.schema';
import {
  MAIL_TRANSPORT,
  MailService,
  type MailTransport,
  smtpTransportOptions,
} from './mail.service';

/**
 * NOT-01: one Nodemailer SMTP transport per app, created at startup when SMTP
 * is configured. NOT-02 / NOT-03 import this module for `MailService`.
 */
@Module({
  providers: [
    {
      provide: MAIL_TRANSPORT,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): MailTransport | null =>
        isSmtpConfigured(config)
          ? createTransport(smtpTransportOptions(config))
          : null,
    },
    MailService,
  ],
  exports: [MailService],
})
export class MailModule {}
