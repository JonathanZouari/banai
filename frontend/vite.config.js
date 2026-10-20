import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5173 },
  // jsPDF is loaded on demand (Export). Pre-bundling it up front stops the dev server from reloading the page the first time Export is used.
  optimizeDeps: { include: ['jspdf'] },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.js'],
    coverage: { provider: 'v8', include: ['src/**/*.js'], thresholds: { 'src/domain/**': { lines: 80 } } },
  },
});
