import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: false,
    // The Python API (server/) does the IRSA / AWS / Gaia / CatWISE work.
    proxy: { '/api': { target: 'http://localhost:8000', changeOrigin: true } },
  },
  preview: { proxy: { '/api': { target: 'http://localhost:8000', changeOrigin: true } } },
});
