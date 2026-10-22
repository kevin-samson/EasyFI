import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // PGlite ships wasm + data files that must be loaded from node_modules, not bundled.
  serverExternalPackages: ['@electric-sql/pglite'],
  transpilePackages: [
    '@easyfi/contracts',
    '@easyfi/core',
    '@easyfi/data-sources',
    '@easyfi/db',
    '@easyfi/services',
  ],
};

export default nextConfig;
