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
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/') || id.includes('node_modules/scheduler/')) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/react-router') || id.includes('node_modules/@remix-run')) {
            return 'vendor-router';
          }
          if (id.includes('node_modules/framer-motion') || id.includes('node_modules/motion-') || id.includes('node_modules/hey-listen')) {
            return 'vendor-motion';
          }
          if (id.includes('node_modules/@google/genai')) {
            return 'vendor-genai';
          }
          if (id.includes('node_modules/@supabase/')) {
            return 'vendor-supabase';
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'vendor-icons';
          }
          if (id.includes('node_modules/')) {
            return 'vendor-utils';
          }
        }
      }
    }
  },
});
