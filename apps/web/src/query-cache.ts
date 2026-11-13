import type { QueryClient } from '@tanstack/react-query';
import { AUTH_CONFIG_KEY } from './config/use-runtime-config';

/**
 * Drops every cached query and mutation except the runtime config, which is
 * not user data and gates the whole app: removing it while it loads would
 * leave the config gate on its spinner (AUTH-03 logout, session end).
 */
export function clearUserData(queryClient: QueryClient): void {
  queryClient.removeQueries({
    predicate: (q) => q.queryKey[0] !== AUTH_CONFIG_KEY[0],
  });
  queryClient.getMutationCache().clear();
}
