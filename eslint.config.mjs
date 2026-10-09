import js from '@eslint/js';
import globals from 'globals';
export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
        },
      ],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      eqeqeq: 'error',
    },
  },
  // These two fragments are joined around verified upstream code at build time.
  // Declare only that shared lexical interface; keep other lint rules enabled.
  {
    files: ['packages/isocity/engine-prefix.js'],
    rules: {
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern:
            '^(w|h|x|y|ntiles|tileWidth|tileHeight|tool|isPlacing|map|bg|cf|texture|changed|updateHashState)$',
          caughtErrors: 'none',
        },
      ],
    },
  },
  {
    files: ['packages/isocity/engine-suffix.js'],
    languageOptions: {
      globals: {
        texture: 'writable',
        map: 'writable',
        bg: 'writable',
        cf: 'writable',
        w: 'readonly',
        drawMap: 'readonly',
        tool: 'writable',
        click: 'readonly',
        isPlacing: 'writable',
        viz: 'readonly',
        changed: 'writable',
      },
    },
  },
];
