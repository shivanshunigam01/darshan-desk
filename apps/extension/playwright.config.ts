import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from '@playwright/test';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  use: {
    baseURL: process.env.DD_API_BASE || 'http://127.0.0.1:4000',
  },
  webServer: {
    command: 'npm run start -w darshan-desk-server',
    cwd: repoRoot,
    url: 'http://127.0.0.1:4000/health',
    reuseExistingServer: true,
    timeout: 180_000,
  },
});