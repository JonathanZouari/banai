import { test, expect, openChat, openDesigner } from './fixtures.js';

// bobHabanai Day 4: push-to-talk (ADR-021) with Chromium's fake microphone (a tone, no prompt). The
// recording is real (MediaRecorder); only the two OpenAI-backed endpoints are mocked.
test.use({
  permissions: ['microphone'],
  launchOptions: {
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  },
});

const STORAGE_KEY = 'banai.openaiApiKey';
const KEY = 'sk-test-e2eKey0123456789abcdefWXYZ';
const TRANSCRIPT = 'הוסף מדף בתא השמאלי';
const EBML = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);

const envelope = (data) => ({
  status: 200,
  contentType: 'application/json',
  headers: { 'Access-Control-Allow-Origin': '*' },
  body: JSON.stringify({ success: true, data, error: null }),
});

/** Mocks transcription and the agent; returns what each received. */
async function mockAi(page) {
  const uploads = [];
  const turns = [];
  await page.route('**/api/settings/ai/verify', (route) => route.fulfill(envelope({ status: 'connected', model: 'gpt-test-mini', maskedKey: 'sk-...WXYZ', checkedAt: '2026-10-17T09:30:00+00:00' })));
  await page.route('**/api/voice/transcribe', async (route) => {
    const request = route.request();
    uploads.push({ url: request.url(), type: request.headers()['content-type'] ?? '', body: request.postDataBuffer() ?? Buffer.alloc(0) });
    await route.fulfill(envelope({ text: TRANSCRIPT }));
  });
  await page.route('**/api/chat', async (route) => {
    turns.push(route.request().postDataJSON());
    await route.fulfill(envelope({ reply: 'בשמחה. באיזה גובה תרצו את המדף?', model: 'gpt-test-mini' }));
  });
  // Spoken replies (ADR-028) never reach OpenAI from a test; a test that inspects them adds its own route,
  // which Playwright checks first.
  await page.route('**/api/voice/speak', (route) => route.fulfill({
    status: 200, contentType: 'audio/wav', headers: { 'Access-Control-Allow-Origin': '*' }, body: silentWav(1),
  }));
  return { uploads, turns };
}

async function micCentre(page) {
  const mic = page.getByTestId('chat-mic');
  await expect(mic).toBeVisible();
  const box = await mic.boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

const composer = (page) => page.locator('.chat__composer');

test.describe('push-to-talk voice', () => {
  test('hold to record, release to send: the transcript goes through the chat like typed text', async ({ page }) => {
    const { uploads, turns } = await mockAi(page);
    await page.addInitScript(([name, key]) => localStorage.setItem(name, key), [STORAGE_KEY, KEY]);
    await openDesigner(page);
    await openChat(page);
    await expect(page.getByTestId('chat-status')).toHaveText('המפתח מחובר');
    const before = await page.evaluate(() => window.__banai.store.getState().revision);

    const at = await micCentre(page);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await expect(composer(page)).toHaveClass(/is-voice-recording/);
    await expect(page.getByTestId('chat-voice')).toBeVisible();
    await expect(page.getByTestId('chat-mic')).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(2200); // the fake device's tone has to reach the level meter
    await page.mouse.up();

    await expect(page.getByTestId('chat-bubble-user')).toHaveText(TRANSCRIPT);
    await expect(page.getByTestId('chat-bubble-assistant')).toHaveText('בשמחה. באיזה גובה תרצו את המדף?');
    await expect(page.getByTestId('chat-voice')).toBeHidden();
    await expect(composer(page)).not.toHaveClass(/is-voice-recording/);

    // One multipart upload: the key in the body (never the URL) and a real WebM/Opus recording.
    expect(uploads).toHaveLength(1);
    const [upload] = uploads;
    expect(upload.url).not.toContain(KEY);
    expect(upload.type).toMatch(/^multipart\/form-data; boundary=/);
    const text = upload.body.toString('latin1');
    expect(text).toContain('name="apiKey"');
    expect(text).toContain(KEY);
    expect(text).toMatch(/name="audio"; filename="voice"\r\nContent-Type: audio\/webm/);
    expect(upload.body.includes(EBML)).toBe(true);
    expect(upload.body.length).toBeGreaterThan(1000);
    expect(upload.body.length).toBeLessThan(1024 * 1024);

    // The agent got the transcript as the customer's message; voice never changes the design itself.
    expect(turns).toHaveLength(1);
    expect(turns[0].messages.at(-1)).toEqual({ role: 'user', content: TRANSCRIPT });
    expect(await page.evaluate(() => window.__banai.store.getState().revision)).toBe(before);
  });

  test('dragging away cancels without uploading; Space records hands-free until pressed again', async ({ page }) => {
    const { uploads } = await mockAi(page);
    await page.addInitScript(([name, key]) => localStorage.setItem(name, key), [STORAGE_KEY, KEY]);
    await openDesigner(page);
    await openChat(page);

    const at = await micCentre(page);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.waitForTimeout(900);
    await page.mouse.move(at.x, at.y - 140, { steps: 5 });
    await expect(composer(page)).toHaveClass(/is-voice-cancel/);
    await expect(page.getByTestId('chat-voice')).toContainText('שחררו כדי לבטל');
    await page.mouse.up();
    await expect(page.getByTestId('chat-voice')).toBeHidden();
    await page.waitForTimeout(500);
    expect(uploads).toHaveLength(0);
    await expect(page.getByTestId('chat-bubble-user')).toHaveCount(0);

    await page.getByTestId('chat-mic').focus();
    await page.keyboard.press('Space');
    await expect(page.getByTestId('chat-voice')).toContainText('לחצו שוב כדי לשלוח');
    await page.waitForTimeout(2200);
    await page.keyboard.press('Space');
    await expect(page.getByTestId('chat-bubble-user')).toHaveText(TRANSCRIPT);
    expect(uploads).toHaveLength(1);
  });

  test('without an OpenAI key nothing is uploaded and the chat says how to connect one', async ({ page }) => {
    const { uploads } = await mockAi(page);
    await openDesigner(page);
    await openChat(page);
    const at = await micCentre(page);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.waitForTimeout(1500);
    await page.mouse.up();
    await expect(page.locator('#toast')).toContainText('הוסיפו מפתח OpenAI');
    expect(uploads).toHaveLength(0);
  });

  test('a spoken question gets a spoken answer in the chosen voice; a typed one stays silent; the speaker mutes it', async ({ page }) => {
    const { uploads, turns } = await mockAi(page);
    const speaks = [];
    await page.route('**/api/voice/speak', async (route) => {
      speaks.push(route.request().postDataJSON());
      await route.fulfill({ status: 200, contentType: 'audio/wav', headers: { 'Access-Control-Allow-Origin': '*' }, body: silentWav(3) });
    });
    await page.addInitScript(([name, key]) => localStorage.setItem(name, key), [STORAGE_KEY, KEY]);
    await openDesigner(page);
    await openChat(page);
    const speaker = page.getByTestId('chat-speaker');
    await expect(speaker).toHaveAttribute('aria-pressed', 'true');
    await expect(speaker).toHaveAttribute('aria-label', /קול שנוצר ב-AI/);

    const at = await micCentre(page);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.waitForTimeout(2200);
    await page.mouse.up();
    await expect(page.getByTestId('chat-bubble-assistant')).toHaveCount(1);
    expect(turns[0].spoken).toBe(true); // the agent answers for the ear
    await expect.poll(() => speaks.length).toBe(1);
    expect(speaks[0]).toEqual({ apiKey: KEY, text: 'בשמחה. באיזה גובה תרצו את המדף?', voice: 'cedar' });
    const pill = page.getByTestId('chat-speaking');
    await expect(pill).toBeVisible();
    await expect(pill).toContainText('קול שנוצר ב-AI'); // OpenAI asks for a clear AI-voice disclosure
    await pill.click(); // stops the voice
    await expect(pill).toBeHidden();

    // Typed: a silent reply.
    await page.getByTestId('chat-input').fill('ומה עם מראה?');
    await page.getByTestId('chat-send').click();
    await expect(page.getByTestId('chat-bubble-assistant')).toHaveCount(2);
    expect(turns[1]).not.toHaveProperty('spoken');
    await page.waitForTimeout(500);
    expect(speaks).toHaveLength(1);

    // Muted: spoken questions are answered in writing only.
    await speaker.click();
    await expect(speaker).toHaveAttribute('aria-pressed', 'false');
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.waitForTimeout(2200);
    await page.mouse.up();
    await expect(page.getByTestId('chat-bubble-assistant')).toHaveCount(3);
    await page.waitForTimeout(500);
    expect(speaks).toHaveLength(1);
    expect(uploads).toHaveLength(2);
    expect(await page.evaluate(() => localStorage.getItem('banai.speech.enabled'))).toBe('false');
  });

  test('AI settings: the reply voice is picked by ear and remembered', async ({ page }) => {
    await mockAi(page);
    const speaks = [];
    await page.route('**/api/voice/speak', async (route) => {
      speaks.push(route.request().postDataJSON());
      await route.fulfill({ status: 200, contentType: 'audio/wav', headers: { 'Access-Control-Allow-Origin': '*' }, body: silentWav(1) });
    });
    await page.addInitScript(([name, key]) => localStorage.setItem(name, key), [STORAGE_KEY, KEY]);
    await openDesigner(page);
    await openChat(page);
    await page.getByTestId('chat-status').click();
    const select = page.getByTestId('ai-voice-select');
    await expect(select).toHaveValue('cedar');
    await select.selectOption('marin');
    await page.getByTestId('ai-voice-preview').click();
    await expect.poll(() => speaks.length).toBe(1);
    expect(speaks[0].voice).toBe('marin');
    expect(speaks[0].text).toContain('בוב הבנאי');
    expect(await page.evaluate(() => localStorage.getItem('banai.speech.voice'))).toBe('marin');
  });
});

/** `seconds` of 8 kHz mono 16-bit silence as a WAV file (a stand-in for the server's MP3). */
function silentWav(seconds) {
  const samples = 8000 * seconds;
  const data = samples * 2;
  const wav = Buffer.alloc(44 + data);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + data, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24);
  wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(data, 40);
  return wav;
}
