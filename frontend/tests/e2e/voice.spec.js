import { expect, openDesigner, test } from './fixtures.js';

// Voice end to end with the network edge mocked (no ElevenLabs calls). The microphone is
// Chrome's fake media device (see playwright.config.js), so recording really runs.

const ok = (data) => ({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
const SILENT_MP3 = Buffer.from('SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA', 'base64');

async function mockVoice(page, { voice = true } = {}) {
  const calls = { speak: [], transcribe: [] };
  await page.route('**/api/health', (route) => route.fulfill(ok({ status: 'ok', env: 'e2e', agent: true, voice })));
  await page.route('**/api/chat', (route) => route.fulfill(ok({ reply: 'מדף בגובה 80 ס"מ מתאים לקפלים.', proposal: null })));
  await page.route('**/api/voice/speak', async (route) => {
    calls.speak.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'audio/mpeg', body: SILENT_MP3 });
  });
  await page.route('**/api/voice/transcribe**', async (route) => {
    const request = route.request();
    calls.transcribe.push({ url: request.url(), type: request.headers()['content-type'], size: request.postDataBuffer()?.length ?? 0 });
    await route.fulfill(ok({ text: 'תוסיף מגירה למטה' }));
  });
  return calls;
}

async function askOnce(page) {
  await page.getByTestId('chat-input').fill('איפה לשים מדף?');
  await page.getByTestId('chat-send').click();
  await expect(page.getByTestId('chat-messages')).toContainText('מדף בגובה 80');
}

test.describe('designer voice', () => {
  test('a reply can be read aloud with the server voice', async ({ page }) => {
    const calls = await mockVoice(page);
    await openDesigner(page);
    await askOnce(page);
    await page.getByTestId('chat-speak').click();
    await expect.poll(() => calls.speak.length).toBe(1);
    expect(calls.speak[0]).toEqual({ text: 'מדף בגובה 80 ס"מ מתאים לקפלים.', language: 'he' });
  });

  test('"Read replies" speaks each new reply automatically and is remembered', async ({ page }) => {
    const calls = await mockVoice(page);
    await openDesigner(page);
    await page.getByTestId('chat-auto-speak').click();
    await expect(page.getByTestId('chat-auto-speak')).toHaveAttribute('aria-pressed', 'true');
    await askOnce(page);
    await expect.poll(() => calls.speak.length).toBe(1);
    expect(await page.evaluate(() => localStorage.getItem('banai.chat.autoSpeak'))).toBe('on');
  });

  test('the microphone records, transcribes into the composer, and sends nothing by itself', async ({ page }) => {
    const calls = await mockVoice(page);
    await openDesigner(page);
    const mic = page.getByTestId('chat-mic');
    await mic.click();
    await expect(mic).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('chat-voice-status')).toHaveText('מקשיב…');
    await page.waitForTimeout(600); // a little fake audio
    await mic.click();
    await expect(page.getByTestId('chat-input')).toHaveValue('תוסיף מגירה למטה');
    expect(calls.transcribe).toHaveLength(1);
    expect(calls.transcribe[0].url).toMatch(/language=he$/);
    expect(calls.transcribe[0].type).toMatch(/^audio\//);
    expect(calls.transcribe[0].size).toBeGreaterThan(0);
    await expect(page.getByTestId('chat-messages')).toBeHidden(); // nothing was sent
  });

  test('without server voice there is no microphone, but replies can still be read by the browser', async ({ page }) => {
    const calls = await mockVoice(page, { voice: false });
    await openDesigner(page);
    await expect(page.getByTestId('chat-mic')).toHaveCount(0);
    await askOnce(page);
    await expect(page.getByTestId('chat-speak')).toBeVisible();
    await page.getByTestId('chat-speak').click();
    await page.waitForTimeout(200);
    expect(calls.speak).toHaveLength(0); // the browser's own voice, not the server
  });
});
