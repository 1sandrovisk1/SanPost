import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
export default defineConfig({
  plugins: [tsconfigPaths()],
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'jsdom',
    include: [
      'apps/frontend/src/components/new-launch/providers/**/*.social.spec.tsx',
    ],
    maxWorkers: 1,
    minWorkers: 1,
  },
});
