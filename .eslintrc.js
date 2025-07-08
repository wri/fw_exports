module.exports = {
  root: true,
  parser: '@typescript-eslint/parser', // Specifies the ESLint parser
  parserOptions: {
    ecmaVersion: 2020, // Allows parsing modern ECMAScript features
    sourceType: 'module', // Allows for the use of imports
  },
  env: {
    node: true,
    es2021: true,
  },
  plugins: ['@typescript-eslint', 'prettier'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended', // Enables eslint-plugin-prettier and displays prettier errors as ESLint errors
  ],
  rules: {
    // Disable the rule forbidding require() style imports
    '@typescript-eslint/no-require-imports': 'off',

    // Optional: enforce Prettier formatting rules
    'prettier/prettier': ['error'],

    // You can customize other rules here
    'no-console': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
  },
};