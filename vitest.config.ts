import { defineConfig } from 'vitest/config';

// Pruebas unitarias de lógica pura (sin Angular ni navegador).
// Los flujos completos se prueban con Cypress (cypress/e2e).
export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    environment: 'node',
  },
});
