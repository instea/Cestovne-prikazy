import { Controller, Get, Query } from '@nestjs/common';
import type { AuditPageDto } from '@leaves/shared/audit';
import { type AuthUser, CurrentUser } from '../auth/auth-user';
import { requireAdmin } from '../auth/require-admin';
import { parseAuditQuery } from './audit-query';
import { AuditService } from './audit.service';

/** NFR-06: admin read access to the audit log. Reading is not audited. */
@Controller('api/admin/audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(
    @CurrentUser() caller: AuthUser,
    @Query() query: Record<string, unknown>,
  ): Promise<AuditPageDto> {
    requireAdmin(caller);
    return this.audit.list(parseAuditQuery(query));
  }
}
