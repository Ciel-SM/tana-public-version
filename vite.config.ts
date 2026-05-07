import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  return {
    // './' base is required for Electron file:// protocol in production
    base: mode === 'production' ? './' : '/',
    server: {
      port: 3000,
      host: '127.0.0.1',
      strictPort: false,
    },
    preview: {
      port: 3000,
      host: '127.0.0.1',
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './tests/setup.ts',
      restoreMocks: true,
      clearMocks: true,
    },
  };
});
