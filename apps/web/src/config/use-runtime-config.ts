import type { AuthConfigDto } from '@leaves/shared/dto';
import { createContext, useContext } from 'react';

/** Query key of `GET /api/auth/config` (kept when user data is cleared). */
export const AUTH_CONFIG_KEY = ['auth-config'] as const;

export const RuntimeConfigContext = createContext<AuthConfigDto | null>(null);

export function useRuntimeConfig(): AuthConfigDto {
  const config = useContext(RuntimeConfigContext);
  if (!config) throw new Error('useRuntimeConfig outside <RuntimeConfigGate>');
  return config;
}
