import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // Builds, dépendances et scripts jetables
  globalIgnores(['dist', 'node_modules', 'scratch', 'temp', 'temp_captures', 'archives']),

  // ============================================================
  // Application React (navigateur)
  // ============================================================
  {
    files: ['src/**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_' }],
      // Les erreurs silencieuses sont un piège : on impose au moins une trace.
      'no-empty': ['warn', { allowEmptyCatch: false }],
    },
  },

  // ============================================================
  // Fonctions serverless Vercel (Node / Edge)
  // ============================================================
  {
    files: ['api/**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.node },
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    },
    rules: {
      'no-unused-vars': ['warn', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_' }],
    },
  },

  // ============================================================
  // Scripts d'exploitation (Node ESM)
  // ============================================================
  {
    files: ['scripts/**/*.{mjs,js}'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.node },
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    },
    rules: {
      'no-unused-vars': ['warn', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_' }],
    },
  },

  // ============================================================
  // Fichiers de configuration à la racine
  // ============================================================
  {
    files: ['*.config.js', '*.config.mjs'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
])
