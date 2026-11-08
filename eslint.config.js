// @ts-check
const eslint = require('@eslint/js');
const { defineConfig } = require('eslint/config');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');

/**
 * Fronteiras entre camadas (ENGENHARIA_DE_SOFTWARE §4.5).
 * Cada entrada lista as camadas que a pasta NÃO pode importar.
 */
// Só caminhos relativos (./ ou ../): evita casar pacotes como "@angular/core".
const camada = (nome) => ({
  regex: `^\\.{1,2}/(?:.*/)?${nome}(?:/|$)`,
  message: `Violação de camada: esta pasta não pode importar de "${nome}/" (ver ENGENHARIA_DE_SOFTWARE §4.5).`,
});

const bibliotecasForaDoDominio = [
  '@angular/*',
  'rxjs',
  'rxjs/*',
  'idb',
  'hash-wasm',
  'zod',
  'chart.js',
  'chart.js/*',
];

const restricao = (pastas, padroesExtras = []) => ({
  'no-restricted-imports': [
    'error',
    {
      patterns: [
        ...pastas.map(camada),
        ...padroesExtras.map((p) => ({
          group: [p],
          message: 'O domínio é TypeScript puro: só pode importar date-fns.',
        })),
      ],
    },
  ],
});

module.exports = defineConfig([
  {
    ignores: ['dist/', 'coverage/', '.angular/', 'node_modules/'],
  },
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
      angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'app', style: 'camelCase' },
      ],
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'app', style: 'kebab-case' },
      ],
      '@angular-eslint/prefer-on-push-component-change-detection': 'error',
      // RNF-008: nenhum dado do usuário no console.
      'no-console': ['error', { allow: ['error'] }],
    },
  },
  {
    files: ['**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
    rules: {},
  },

  // ---- Fronteiras entre camadas ----
  {
    files: ['src/app/domain/**/*.ts'],
    rules: restricao(
      ['application', 'infrastructure', 'features', 'ui', 'core'],
      bibliotecasForaDoDominio,
    ),
  },
  {
    files: ['src/app/application/**/*.ts'],
    rules: restricao(['infrastructure', 'features', 'ui', 'core']),
  },
  {
    files: ['src/app/infrastructure/**/*.ts'],
    rules: restricao(['features', 'ui', 'core']),
  },
  {
    files: ['src/app/features/**/*.ts'],
    rules: restricao(['infrastructure', 'core']),
  },
  {
    files: ['src/app/ui/**/*.ts'],
    rules: restricao(['application', 'infrastructure', 'features', 'core']),
  },
  // Testes podem montar a aplicação com adaptadores reais (testes de integração).
  {
    files: ['src/**/*.spec.ts', 'src/testing/**/*.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
]);
