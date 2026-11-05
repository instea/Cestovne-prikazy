import type { AuthConfigDto } from '@leaves/shared/dto';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { FullPageSpinner } from '../ui/Spinner';
import { RuntimeConfigContext } from './use-runtime-config';

/** Loads `GET /api/auth/config` once before any route renders. */
export function RuntimeConfigGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: ['auth-config'],
    queryFn: () => api<AuthConfigDto>('/auth/config'),
    staleTime: Infinity,
    retry: false,
  });

  if (query.isPending) return <FullPageSpinner />;
  if (query.isError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p role="alert">{t('app.configError')}</p>
        <button
          type="button"
          className="rounded bg-slate-800 px-4 py-2 text-white"
          onClick={() => void query.refetch()}
        >
          {t('app.retry')}
        </button>
      </div>
    );
  }
  return (
    <RuntimeConfigContext.Provider value={query.data}>
      {children}
    </RuntimeConfigContext.Provider>
  );
}
