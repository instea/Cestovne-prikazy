import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { refreshSession, sessionStore } from './auth/session';
import { RuntimeConfigGate } from './config/runtime-config';
import { clearUserData } from './query-cache';
import { createQueryClient } from './query-client';
import { routes } from './router';
import { ErrorBoundary } from './ui/ErrorPage';
import { Toaster } from './ui/toast';

type AppRouter = ReturnType<typeof createBrowserRouter>;

export interface AppProps {
  /** Tests pass a memory router and their own client. */
  router?: AppRouter;
  queryClient?: QueryClient;
}

export function App({
  router: givenRouter,
  queryClient: givenClient,
}: AppProps) {
  const [router] = useState(() => givenRouter ?? createBrowserRouter(routes));
  const [queryClient] = useState(() => givenClient ?? createQueryClient());

  useEffect(() => {
    if (sessionStore.get().status === 'unknown') void refreshSession();
    // A session that ends for any reason drops all cached user data. Only
    // an ending session clears: a boot that finds no session has nothing
    // to drop, and clearing then would race the runtime-config load.
    let previous = sessionStore.get().status;
    return sessionStore.subscribe(() => {
      const { status } = sessionStore.get();
      if (status === 'anonymous' && previous === 'authenticated') {
        clearUserData(queryClient);
      }
      previous = status;
    });
  }, [queryClient]);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <RuntimeConfigGate>
          <RouterProvider router={router} />
        </RuntimeConfigGate>
        <Toaster />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
