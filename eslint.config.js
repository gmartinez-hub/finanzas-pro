import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/**', 'node_modules/**', '.vercel/**'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } } },
    rules: {
      // Preserve the recovered app while enforcing execution and data-integrity errors.
      'no-undef': 'error',
      'no-unused-vars': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-useless-escape': 'off',
    },
  },
  { files: ['src/**/*.{js,jsx}'], languageOptions: { globals: globals.browser } },
  { files: ['api/**/*.js', 'tests/**/*.js', '*.js'], languageOptions: { globals: globals.node } },
];
