import type { LeaveDto } from '@leaves/shared/dto';
import { queryOptions } from '@tanstack/react-query';
import { api } from '../api/client';
import { PENDING_LEAVES_KEY } from './query-keys';

/**
 * The PENDING leaves query shared by the nav badge and `/approval` (APR-02).
 * Refetched on every window focus, also within the global 30 s staleTime
 * (user decision 2026-11-11); no polling.
 */
export const pendingLeavesQuery = queryOptions({
  queryKey: PENDING_LEAVES_KEY,
  queryFn: () => api<LeaveDto[]>('/leaves?state=PENDING'),
  refetchOnWindowFocus: 'always',
});
