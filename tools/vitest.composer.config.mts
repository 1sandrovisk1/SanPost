import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['apps/frontend/src/components/new-launch/*.spec.ts'],
    maxWorkers: 1,
    minWorkers: 1,
  },
});
