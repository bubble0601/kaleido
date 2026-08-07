import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const serverPort = process.env.KALEIDO_SERVER_PORT ?? '4890';

export default defineConfig({
  root: 'src/client',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
    chunkSizeWarningLimit: 5000,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': `http://localhost:${serverPort}`,
    },
  },
});
