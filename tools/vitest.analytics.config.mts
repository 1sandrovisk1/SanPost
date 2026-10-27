import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
export default defineConfig({
  plugins: [tsconfigPaths()],
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'jsdom',
    setupFiles: ['tools/vitest.facebook-panel.setup.ts'],
    include: [
      'apps/frontend/src/components/analytics/*.spec.{ts,tsx}',
      'apps/frontend/src/components/platform-analytics/*.spec.tsx',
      'apps/frontend/src/components/launches/statistics.spec.tsx',
    ],
    maxWorkers: 1,
    minWorkers: 1,
  },
});
