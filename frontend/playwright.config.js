import { defineConfig, devices } from '@playwright/test';

// Dedicated ports so E2E never collides with a running dev server.
const API_PORT = 8010;
const WEB_PORT = 5183;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1, // software WebGL (SwiftShader) makes parallel browsers slower and flaky, not faster
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    viewport: { width: 1440, height: 900 },
  },
  projects: [{
    name: 'chromium',
    use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 },
      permissions: ['microphone'],
      launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } },
  }],
  webServer: [
    {
      // The real app with a scripted stand-in for OpenAI (backend/tests/e2e_app.py): no key, no network.
      command: `uv run uvicorn tests.e2e_app:app --port ${API_PORT}`,
      cwd: '../backend',
      url: `http://localhost:${API_PORT}/api/health`,
      env: { APP_ENV: 'e2e', CORS_ORIGINS: `http://localhost:${WEB_PORT}`, CHAT_RATE_LIMIT: '1000/minute', VOICE_RATE_LIMIT: '1000/minute' },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      env: { VITE_API_BASE_URL: `http://localhost:${API_PORT}` },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
