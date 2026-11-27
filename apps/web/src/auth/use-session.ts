import { useSyncExternalStore } from 'react';
import { sessionStore, type SessionState } from './session';

export function useSession(): SessionState {
  return useSyncExternalStore(
    (listener) => sessionStore.subscribe(listener),
    () => sessionStore.get(),
  );
}
