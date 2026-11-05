import { readFileSync } from 'node:fs';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { sharedSourceAlias } from '../../vitest.shared.js';

const rootPackage = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as { version: string };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: sharedSourceAlias },
  define: { __APP_VERSION__: JSON.stringify(rootPackage.version) },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:4100',
      '/health-check': 'http://localhost:4100',
    },
  },
});
