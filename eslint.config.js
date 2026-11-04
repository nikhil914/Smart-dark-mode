import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/.output/**', '**/.wxt/**', 'docs/**'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      // Index access is checked by noUncheckedIndexedAccess; `!` marks the spots proven safe.
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    // Node scripts; some functions are serialised and run inside the page.
    files: ['tests/harness/**/*.mjs'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser, DarkReader: 'readonly', chrome: 'readonly' },
    },
    rules: { 'no-console': 'off' },
  },
  {
    // Command-line tools for building and signing the fixes bundle.
    files: ['scripts/**/*.{mjs,ts}'],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-console': 'off' },
  },
);
