import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { sessionStore } from '../auth/session';
import { i18n } from '../i18n';
import { fakeGis, installFakeGis } from './fake-gis';
import { server } from './server';

// findBy*/waitFor default is 1 s; a full parallel run (lazy chunks, app
// boot) sometimes needs longer although each file passes in ~30 ms alone.
configure({ asyncUtilTimeout: 3000 });

beforeAll(() => {
  installFakeGis();
  server.listen({ onUnhandledFrame: 'error' });
});
afterEach(async () => {
  cleanup();
  server.resetHandlers();
  sessionStore.reset();
  fakeGis.reset();
  localStorage.clear();
  await i18n.changeLanguage('en');
});
afterAll(() => server.close());
