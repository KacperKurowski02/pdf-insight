/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// WAZNE: `base` musi odpowiadac nazwie repozytorium, inaczej GitHub Pages
// nie zaladuje assetow (klasyczna pulapka z briefu, sekcja 03).
export default defineConfig({
  base: '/pdf-insight/',
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
