import { Module } from '@nestjs/common';
import { SsoClient } from './sso.client';

@Module({ providers: [SsoClient], exports: [SsoClient] })
export class SsoModule {}
