import type { UserRefDto } from './dto.js';

/**
 * NFR-06 audit log contract shared by the API (`GET /api/admin/audit`) and
 * the `/audit` screen.
 */
export const AUDIT_ACTIONS = [
  'LEAVE_CREATED',
  'LEAVE_APPROVED',
  'LEAVE_REJECTED',
  'LEAVE_DELETED',
  'USER_REGISTERED',
  'USER_UPDATED',
  'USER_ROLE_CHANGED',
  'USER_DEACTIVATED',
  'USER_ANONYMIZED',
  'USER_DATA_EXPORTED',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ACTOR_TYPES = ['user', 'cli'] as const;
export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number];

export const AUDIT_TARGET_TYPES = ['LEAVE', 'USER'] as const;
export type AuditTargetType = (typeof AUDIT_TARGET_TYPES)[number];

export const AUDIT_DEFAULT_PAGE_SIZE = 50;
export const AUDIT_MAX_PAGE_SIZE = 200;

export interface AuditEntryDto {
  id: string;
  /** ISO 8601 UTC. */
  at: string;
  actorType: AuditActorType;
  actorId: string | null;
  /** Null for `cli` or when no User with `actorId` exists. */
  actor: UserRefDto | null;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId: string;
  details: Record<string, unknown> | null;
}

export interface AuditPageDto {
  items: AuditEntryDto[];
  page: number;
  pageSize: number;
  total: number;
}
