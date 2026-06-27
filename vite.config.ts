import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import devServer from '@hono/vite-dev-server';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    devServer({
      entry: 'src/worker.ts',
      injectClientScript: false,
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
      'next/navigation': path.resolve(__dirname, './shims/next/navigation.tsx'),
      'next/link': path.resolve(__dirname, './shims/next/link.tsx'),
      'next/image': path.resolve(__dirname, './shims/next/image.tsx'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
