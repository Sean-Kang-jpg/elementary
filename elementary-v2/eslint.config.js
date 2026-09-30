import tsParser from '@typescript-eslint/parser'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import reactHooks from 'eslint-plugin-react-hooks'

export default [
  {
    ignores: [
      'dist/**',
      '.browser-test-profile/**',
      'etl/local_outputs_*/**',
      'src/components/debug/**',
      'src/**/*_old.ts',
      'src/**/*_old.tsx',
      'src/**/*_original.ts',
      'src/**/*_original.tsx',
    ],
  },
  {
    // The build config is TypeScript too. Without this it was parsed as plain
    // JavaScript, so any type annotation in it failed lint - which is why it had
    // none, and why the lint error looked like a syntax error in valid code.
    files: ['*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: { ...tsPlugin.configs.recommended.rules },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'react-hooks': reactHooks,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      ...reactHooks.configs['recommended-latest'].rules,
      'react-hooks/exhaustive-deps': 'error',
    },
  },
]
