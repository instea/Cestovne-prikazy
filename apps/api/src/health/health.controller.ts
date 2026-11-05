import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../auth/public.decorator';
import { HealthService } from './health.service';

/**
 * `GET`/`HEAD /health-check` (k8s readiness). Old body kept for existing
 * probes: `{ "checkMongo": "ok" | "<error>" }`. Express answers HEAD from
 * the GET route without a body.
 * Public: probes send no token.
 */
@Public()
@Controller('health-check')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  async check(@Res() res: Response): Promise<void> {
    const { ok, message } = await this.health.check();
    res
      .status(ok ? 200 : 500)
      .set('Cache-Control', 'no-store')
      .json({ checkMongo: message });
  }
}
