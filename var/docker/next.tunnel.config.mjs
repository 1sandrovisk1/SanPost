import baseConfig from './next.config.base.mjs';

// OAuth callbacks contain temporary codes in the query string. Keep the normal
// app configuration, but omit Next dev request logs for this tunnel overlay.
export default {
  ...baseConfig,
  // Bound simultaneous module work in the 10 GiB local Docker VM. Keep the
  // production configuration untouched and avoid warming unrelated dev pages.
  experimental: {
    ...baseConfig.experimental,
    preloadEntriesOnStart: false,
  },
  onDemandEntries: { maxInactiveAge: 30000, pagesBufferLength: 1 },
  webpack(config, options) {
    const configured = baseConfig.webpack?.(config, options) || config;
    if (options.dev) configured.parallelism = 4;
    return configured;
  },
  // JSDOM reads its stylesheet relative to the installed module. Bundling the
  // sanitizer for SSR relocates that path and breaks the local calendar page.
  serverExternalPackages: [
    ...new Set([
      ...(baseConfig.serverExternalPackages ?? []),
      'isomorphic-dompurify',
    ]),
  ],
  logging: {
    ...baseConfig.logging,
    incomingRequests: false,
  },
};
