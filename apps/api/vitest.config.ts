import { config as dotenvConfig } from 'dotenv';
import { defineConfig } from 'vitest/config';

dotenvConfig();

export default defineConfig({
  test: {
    include: ['**/*.vitest.ts'],
    environment: 'node',
  },
});
