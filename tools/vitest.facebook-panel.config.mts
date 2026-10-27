import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
export default defineConfig({
  plugins: [tsconfigPaths()],
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'jsdom',
    setupFiles: ['tools/vitest.facebook-panel.setup.ts'],
    include: [
      'libraries/react-shared-libraries/src/form/button.spec.tsx',
      'apps/frontend/src/components/settings/facebook-*.spec.{ts,tsx}',
      'apps/frontend/src/components/settings/meta-*.spec.tsx',
      'apps/frontend/src/components/settings/messaging-*.spec.tsx',
      'apps/frontend/src/components/settings/messenger-*.spec.tsx',
      'apps/frontend/src/components/automations/shared-*.spec.{ts,tsx}',
    ],
    maxWorkers: 1,
    minWorkers: 1,
  },
});
