import path from 'node:path';

import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(import.meta.dirname, 'migrations'));
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            ENVIRONMENT: 'test',
            PUBLIC_BASE_URL: 'https://feedback.test',
            ADMIN_PASSWORD: 'test-password',
            SESSION_SECRET: 'test-session-secret-0123456789abcdef0123456789',
            ADMIN_API_TOKEN: 'fb_admin_test-token',
            ALLOWED_RP_IDS: 'dash.example.test',
          },
        },
      }),
    ],
    test: {
      include: ['test/**/*.test.ts'],
      setupFiles: ['./test/setup.ts'],
    },
  };
});
