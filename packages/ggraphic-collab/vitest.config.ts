// SPDX-License-Identifier: MPL-2.0
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.vitest.ts'],
    environment: 'node',
  },
});
