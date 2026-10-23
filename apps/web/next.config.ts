import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // e2e builds use their own dir so they can run next to `next dev`
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  transpilePackages: [
    '@easyfi/contracts',
    '@easyfi/core',
    '@easyfi/data-sources',
    '@easyfi/db',
    '@easyfi/services',
    '@easyfi/test-fixtures',
  ],
  // Native / wasm drivers must not be bundled.
  serverExternalPackages: ['@electric-sql/pglite', 'postgres'],
  // SQL migrations are read at runtime by the API.
  outputFileTracingIncludes: { '/api/**': ['../../packages/db/drizzle/**'] },
};

export default nextConfig;
