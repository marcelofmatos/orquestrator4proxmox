import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    // separa vendors: o markdown (notes do Proxmox) vira chunk próprio,
    // então releases que só mexem no app não invalidam o cache dele
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          markdown: ['react-markdown', 'remark-gfm'],
        },
      },
    },
  },
  server: { proxy: { '/api': { target: 'http://localhost:8080', ws: true } } },
  test: { environment: 'jsdom', globals: true, setupFiles: './test/setup.ts', include: ['test/**/*.test.{ts,tsx}'] },
} as any);
