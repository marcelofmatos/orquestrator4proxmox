import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  build: { target: 'es2022' },
  server: { proxy: { '/api': { target: 'http://localhost:8080', ws: true } } },
  test: { environment: 'jsdom', globals: true, setupFiles: './test/setup.ts', include: ['test/**/*.test.tsx'] },
} as any);
