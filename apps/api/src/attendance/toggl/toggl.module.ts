import { Module } from '@nestjs/common';
import { TogglClient } from './toggl.client';

@Module({ providers: [TogglClient], exports: [TogglClient] })
export class TogglModule {}
