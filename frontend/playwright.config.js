import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// A continuous tone for the fake microphone, so voice tests do not depend on the fake device's beep timing.
function toneWav() {
  const rate = 16000;
  const samples = rate * 4;
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + samples * 2, 4); buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24); buffer.writeUInt32LE(rate * 2, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i += 1) {
    const mixed = Math.sin((2 * Math.PI * 220 * i) / rate) + 0.6 * Math.sin((2 * Math.PI * 330 * i) / rate) * Math.sin((2 * Math.PI * 3 * i) / rate);
    buffer.writeInt16LE(Math.round(mixed * 9000), 44 + i * 2);
  }
  const dir = join(tmpdir(), 'banai-e2e');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'tone.wav');
  writeFileSync(file, buffer);
  return file;
}
const FAKE_MIC = toneWav();

// Dedicated ports so E2E never collides with a running dev server.
const API_PORT = Number(process.env.E2E_API_PORT ?? 8010);
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 5183);

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
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
      launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-audio-capture=${FAKE_MIC}`] } },
  }],
  webServer: [
    {
      command: `uv run uvicorn app.main:app --port ${API_PORT}`,
      cwd: '../backend',
      url: `http://localhost:${API_PORT}/api/health`,
      // OPENAI_API_KEY is blanked so E2E never reaches OpenAI (routes are mocked or get a 503).
      env: { APP_ENV: 'e2e', CORS_ORIGINS: `http://localhost:${WEB_PORT}`, OPENAI_API_KEY: '' },
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
