import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.spec.ts'],
    exclude: ['node_modules/**', 'build/**'],
    globals: true,
    typecheck: {
      enabled: true,
      ignoreSourceErrors: false,
      tsconfig: './tsconfig.json',
    },
    env: {
      MCP_CONFIG_PATH: 'src/tests/mcp-test-config.json',
    },
  },
});
