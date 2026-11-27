import { Global, Module } from '@nestjs/common';
import { CLOCK, systemClock } from './clock';

/** Provides `CLOCK` (wall clock) to every module; tests override it. */
@Global()
@Module({
  providers: [{ provide: CLOCK, useValue: systemClock }],
  exports: [CLOCK],
})
export class ClockModule {}
