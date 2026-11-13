import { applyDecorators, Controller, Get, Query } from '@nestjs/common';
import {
  AUDIT_ACTIONS,
  AUDIT_ACTOR_TYPES,
  AUDIT_DEFAULT_PAGE_SIZE,
  AUDIT_MAX_PAGE_SIZE,
  AUDIT_TARGET_TYPES,
  type AuditPageDto,
} from '@leaves/shared/audit';
import { ErrorCode } from '@leaves/shared/enums';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/access.decorator';
import { ApiErrors } from '../docs/api-errors';
import { ApiJsonResponse } from '../docs/api-responses';
import { AUDIT_FIRST_PAGE, parseAuditQuery } from './audit-query';
import { AuditService } from './audit.service';

/**
 * The `parseAuditQuery` parameters, documented in this order
 * (`applyDecorators` keeps it; stacked decorators would reverse it).
 */
const AuditQueryParams = () =>
  applyDecorators(
    ApiQuery({
      name: 'action',
      required: false,
      description: 'Repeated and / or comma-separated.',
      schema: {
        type: 'array',
        items: { type: 'string', enum: [...AUDIT_ACTIONS] },
      },
      style: 'form',
      explode: true,
    }),
    ApiQuery({ name: 'actorType', required: false, enum: AUDIT_ACTOR_TYPES }),
    ApiQuery({ name: 'actorId', required: false, type: String }),
    ApiQuery({ name: 'targetType', required: false, enum: AUDIT_TARGET_TYPES }),
    ApiQuery({ name: 'targetId', required: false, type: String }),
    ApiQuery({
      name: 'from',
      required: false,
      description: 'First day (`YYYY-MM-DD`), inclusive.',
      schema: { type: 'string', format: 'date' },
    }),
    ApiQuery({
      name: 'to',
      required: false,
      description: 'Last day (`YYYY-MM-DD`), inclusive.',
      schema: { type: 'string', format: 'date' },
    }),
    ApiQuery({
      name: 'page',
      required: false,
      schema: {
        type: 'integer',
        minimum: AUDIT_FIRST_PAGE,
        default: AUDIT_FIRST_PAGE,
      },
    }),
    ApiQuery({
      name: 'pageSize',
      required: false,
      schema: {
        type: 'integer',
        minimum: 1,
        maximum: AUDIT_MAX_PAGE_SIZE,
        default: AUDIT_DEFAULT_PAGE_SIZE,
      },
    }),
  );

/** NFR-06: admin read access to the audit log. Reading is not audited. */
@ApiTags('audit')
@Roles('admin')
@Controller('api/admin/audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @ApiOperation({
    summary: 'Read the audit log',
    description:
      'Entries newest first, all filters combined (AND). Dates are calendar days ' +
      'in `DEFAULT_TIMEZONE`. Unknown parameters are refused.',
  })
  @AuditQueryParams()
  @ApiJsonResponse(200, 'AuditPageDto', { description: 'One page.' })
  @ApiErrors(
    [400, ErrorCode.VALIDATION_FAILED],
    [400, ErrorCode.AUDIT_RANGE_INVALID],
  )
  list(@Query() query: Record<string, unknown>): Promise<AuditPageDto> {
    return this.audit.list(parseAuditQuery(query));
  }
}
