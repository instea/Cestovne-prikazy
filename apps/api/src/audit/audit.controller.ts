import { Controller, Get, Query } from '@nestjs/common';
import type { AuditPageDto } from '@leaves/shared/audit';
import { Roles } from '../auth/access.decorator';
import { parseAuditQuery } from './audit-query';
import { AuditService } from './audit.service';

/** NFR-06: admin read access to the audit log. Reading is not audited. */
@Roles('admin')
@Controller('api/admin/audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(@Query() query: Record<string, unknown>): Promise<AuditPageDto> {
    return this.audit.list(parseAuditQuery(query));
  }
}
