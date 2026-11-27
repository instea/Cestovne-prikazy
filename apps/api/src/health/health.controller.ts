import { Controller, Get, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../auth/access.decorator';
import { ref } from '../docs/schemas';
import { HealthService } from './health.service';

/**
 * `GET`/`HEAD /health-check` (k8s readiness). Old body kept for existing
 * probes: `{ "checkMongo": "ok" | "<error>" }`. Express answers HEAD from
 * the GET route without a body.
 * Public: probes send no token.
 */
@ApiTags('health')
@Public()
@Controller('health-check')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @ApiOperation({
    summary: 'Readiness probe',
    description:
      'Kubernetes readiness probe: 200 while MongoDB answers, else 500 with the ' +
      'error message (old body format, not `ErrorBody`). HEAD answers the same ' +
      'status without a body. Not cached. Like every route, a JSON request body ' +
      'is parsed before routing; its errors use `ErrorBody`, not the ' +
      '`HealthCheck` body: 400 `VALIDATION_FAILED` (malformed JSON, unsupported ' +
      'charset or content encoding), 403 `PAYLOAD_TOO_LARGE` (over 100 KB).',
  })
  @ApiResponse({
    status: 200,
    description: 'Ready.',
    content: {
      'application/json': {
        schema: ref('HealthCheck'),
        example: { checkMongo: 'ok' },
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: 'MongoDB does not answer.',
    content: {
      'application/json': {
        schema: ref('HealthCheck'),
        example: { checkMongo: 'MongoDB not connected (readyState=0)' },
      },
    },
  })
  async check(@Res() res: Response): Promise<void> {
    const { ok, message } = await this.health.check();
    res
      .status(ok ? 200 : 500)
      .set('Cache-Control', 'no-store')
      .json({ checkMongo: message });
  }
}
