import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Dependency rule from spec §4. Each entry: which internal packages a location may NOT import.
const ALL = ['contracts', 'core', 'data-sources', 'db', 'jobs', 'services', 'test-fixtures'];
const allowed = {
  'packages/core': [],
  'packages/core-tests': ['test-fixtures'],
  'packages/contracts': [],
  'packages/test-fixtures': [],
  'packages/data-sources': ['test-fixtures'],
  'packages/db': ['test-fixtures'],
  'packages/services': ['core', 'db', 'data-sources', 'contracts', 'test-fixtures'],
  'packages/jobs': ['services', 'core', 'db', 'data-sources', 'contracts', 'test-fixtures'],
  'apps/web': ['services', 'contracts'],
};

export function boundaryRules(dir) {
  const ok = allowed[dir];
  return {
    'no-restricted-imports': [
      'error',
      {
        patterns: ALL.filter((p) => !ok.includes(p)).map((p) => ({
          group: [`@easyfi/${p}`, `@easyfi/${p}/*`],
          message: `Dependency rule (spec §4): ${dir} must not import @easyfi/${p}.`,
        })),
      },
    ],
  };
}

const boundaryConfigs = Object.keys(allowed).map((dir) => ({
  files: [`${dir}/**/*.{ts,tsx,mts}`],
  rules: boundaryRules(dir),
}));

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/.next-e2e/**',
      '**/test-results/**',
      '**/playwright-report/**',
      '**/dist/**',
      '**/coverage/**',
      '**/next-env.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  ...boundaryConfigs,
  {
    // Tests anywhere may additionally use shared fixtures.
    files: ['packages/core/**/*.test.ts', 'packages/contracts/**/*.test.ts'],
    rules: boundaryRules('packages/core-tests'),
  },
);
