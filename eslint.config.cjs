// eslint.config.cjs
const path = require('path');
const globals = require('globals');
const tseslint = require('typescript-eslint');
const eslintConfigPrettier = require('eslint-config-prettier/flat');

module.exports = tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [...tseslint.configs.strictTypeChecked, ...tseslint.configs.stylisticTypeChecked],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: __dirname,
      },
    },
    plugins: {},
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
    },
  },
  {
    files: ['**/openapi-client/**'],
    rules: {
      '@typescript-eslint/ban-tslint-comment': 'off',
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
  },
  eslintConfigPrettier,
);
