import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { sharedSourceAlias } from '../../vitest.shared.js';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: sharedSourceAlias },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:4100',
      '/health-check': 'http://localhost:4100',
    },
  },
});
