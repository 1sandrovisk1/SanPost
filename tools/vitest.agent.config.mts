import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
export default defineConfig({
  plugins: [tsconfigPaths()],
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'jsdom',
    include: ['apps/frontend/src/components/agents/*.spec.{ts,tsx}'],
    maxWorkers: 1,
    minWorkers: 1,
  },
});
