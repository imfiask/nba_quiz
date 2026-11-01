import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // il bundle include i dati di tutti i giocatori e la mappa: ~500 KB (≈130 KB compressi) vanno bene
    chunkSizeWarningLimit: 1000,
  },
});
