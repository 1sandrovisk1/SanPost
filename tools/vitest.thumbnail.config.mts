import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
export default defineConfig({
  plugins: [tsconfigPaths()],
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'jsdom',
    include: [
      'libraries/react-shared-libraries/src/helpers/video.frame.spec.tsx',
      'apps/frontend/src/components/launches/helpers/*.thumbnail.spec.{ts,tsx}',
      'apps/frontend/src/components/new-launch/**/*.thumbnail.spec.tsx',
    ],
    maxWorkers: 1,
    minWorkers: 1,
  },
});
