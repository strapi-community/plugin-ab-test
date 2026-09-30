import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['server/src/**/*.test.ts', 'admin/src/**/*.test.ts'],
    environment: 'node',
  },
});
