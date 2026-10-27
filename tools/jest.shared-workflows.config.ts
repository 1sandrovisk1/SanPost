import type { Config } from 'jest';
const config: Config = {
  rootDir: '..', testEnvironment: 'node',
  transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'apps/orchestrator/tsconfig.build.json', isolatedModules: true }] },
  testMatch: ['<rootDir>/apps/orchestrator/src/workflows/shared-flow.workflow.spec.ts'],
};
export default config;
