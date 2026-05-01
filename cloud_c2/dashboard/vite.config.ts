import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3001,
    allowedHosts: ['nearness-hypocrisy-lion.ngrok-free.dev'],
    proxy: {
      '/api': 'http://localhost:5000',
      '/images': 'http://localhost:5000',
    },
  },
});
