import type { AuthConfigDto } from '@leaves/shared/dto';
import { createContext, useContext } from 'react';

export const RuntimeConfigContext = createContext<AuthConfigDto | null>(null);

export function useRuntimeConfig(): AuthConfigDto {
  const config = useContext(RuntimeConfigContext);
  if (!config) throw new Error('useRuntimeConfig outside <RuntimeConfigGate>');
  return config;
}
