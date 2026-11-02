import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const api = 'http://localhost:3000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/v1': api,
      '/auth': api,
      '/oauth': api,
      '/connect': api,
    },
  },
  build: { outDir: 'dist' },
});
