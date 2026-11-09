import { MutationCache, QueryClient } from '@tanstack/react-query';
import { ApiError } from './api/errors';
import { errorMessage } from './i18n/format';
import { showToast } from './ui/toast-store';

export { errorMessage };

const isClientError = (e: unknown) =>
  e instanceof ApiError && e.statusCode >= 400 && e.statusCode < 500;

export function createQueryClient(): QueryClient {
  return new QueryClient({
    mutationCache: new MutationCache({
      // Translated at render: the toast follows a later language switch.
      // A form that shows its own inline alert opts out with
      // `meta: { inlineError: true }`.
      onError: (error, _variables, _context, mutation) => {
        if (mutation.meta?.inlineError === true) return;
        showToast(() => errorMessage(error));
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: true,
        retry: (failureCount, error) =>
          !isClientError(error) && failureCount < 1,
      },
      mutations: { retry: 0 },
    },
  });
}
