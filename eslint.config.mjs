import { defineConfig, globalIgnores } from 'eslint/config';
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default defineConfig([
  globalIgnores(['dist/**', 'coverage/**']),

  {
    extends: [eslint.configs.recommended, ...tseslint.configs.recommended],
  },

  // stdout is reserved for MCP JSON-RPC; only console.error is allowed
  {
    rules: {
      'no-console': ['error', { allow: ['error'] }],
    },
  },

  // Disable formatting rules that conflict with Prettier
  prettierConfig,
]);
