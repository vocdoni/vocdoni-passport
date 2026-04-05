/**
 * ESLint configuration for Vocdoni Passport.
 * Stricter rules that are noisy for this codebase (crypto bit ops, RN patterns)
 * are warnings so CI stays green while preserving signal in the editor.
 */
module.exports = {
  root: true,
  extends: '@react-native',
  rules: {
    'no-bitwise': 'warn',
    'react-hooks/exhaustive-deps': 'warn',
    '@typescript-eslint/no-unused-vars': [
      'warn',
      {argsIgnorePattern: '^_', varsIgnorePattern: '^_'},
    ],
    'react/no-unstable-nested-components': 'warn',
    'react-native/no-inline-styles': 'warn',
  },
  overrides: [
    {
      files: ['jest.setup.js', '__mocks__/**', '__tests__/**'],
      env: {jest: true},
    },
  ],
};
