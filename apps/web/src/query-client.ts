import { MutationCache, QueryClient } from '@tanstack/react-query';
import { ApiError } from './api/errors';
import { i18n } from './i18n';
import { showToast } from './ui/toast-store';

/** Translated message for an API error: `errors.<CODE>`, fallback server message. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return i18n.t(`errors.${error.code}`, { defaultValue: error.message });
  }
  return i18n.t('errors.UNKNOWN');
}

const isClientError = (e: unknown) =>
  e instanceof ApiError && e.statusCode >= 400 && e.statusCode < 500;

export function createQueryClient(): QueryClient {
  return new QueryClient({
    mutationCache: new MutationCache({
      onError: (error) => showToast(errorMessage(error)),
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
