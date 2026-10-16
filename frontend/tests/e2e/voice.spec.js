import { test, expect, openDesigner } from './fixtures.js';

// Voice endpoints are mocked: this suite checks the UI and safety rules, and costs nothing.
// Chromium runs with a fake microphone (see playwright.config.js).
const ok = (data) => ({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
const fail = (status, code, message) => ({ status, contentType: 'application/json', body: JSON.stringify({ success: false, data: null, error: { code, message } }) });
// Raw 16-bit mono PCM (a quiet 220 Hz tone, 0.4 s): what the server streams for a spoken reply.
const pcmReply = () => {
  const samples = 9600;
  const buffer = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i += 1) buffer.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 220 * i) / 24000) * 2000), i * 2);
  return buffer;
};

async function mockVoice(page, { enabled = true, transcript = { text: 'make it 240 cm wide', noSpeech: false }, transcribe = null } = {}) {
  const calls = { transcribe: 0, speak: 0, chat: 0, apply: 0 };
  await page.route('**/api/voice/status', (route) => route.fulfill(ok({ enabled, maxSeconds: 20 })));
  await page.route('**/api/voice/transcribe**', (route) => {
    calls.transcribe += 1;
    return route.fulfill(transcribe ?? ok(transcript));
  });
  await page.route('**/api/voice/speak', (route) => {
    calls.speak += 1;
    return route.fulfill({ status: 200, contentType: 'application/octet-stream', headers: { 'X-Audio-Format': 'pcm16;rate=24000;channels=1' }, body: pcmReply() });
  });
  await page.route('**/api/chat', (route) => {
    calls.chat += 1;
    const { revision } = route.request().postDataJSON();
    return route.fulfill(ok({
      reply: 'Here you go.',
      proposal: { ops: [{ op: 'update_dimensions', width: 2400 }], summary: 'Make it 240 cm wide', baseRevision: revision, baseHash: 'a'.repeat(64), signature: 'b'.repeat(64) },
    }));
  });
  await page.route('**/api/proposals/apply', (route) => { calls.apply += 1; return route.abort(); });
  return calls;
}

async function voiceOn(page) {
  await page.getByTestId('voice-toggle').click();
  await expect(page.getByTestId('voice-toggle')).toHaveAttribute('aria-checked', 'true');
}

async function speakIntoComposer(page) {
  await page.getByTestId('voice-mic').click();
  await expect(page.getByTestId('voice-status')).toContainText('Listening');
  await page.waitForTimeout(1500); // the fake microphone plays a continuous tone (see playwright.config.js)
  await page.getByTestId('voice-mic').click();
}

const revision = (page) => page.evaluate(() => window.__banai.store.getState().revision);

test.describe('voice', () => {
  test('is off by default: no microphone, and replies are not read aloud', async ({ page }) => {
    const calls = await mockVoice(page);
    await openDesigner(page);
    await expect(page.getByTestId('voice-toggle')).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByTestId('voice-mic')).toBeHidden();
    await expect(page.getByText('recording is sent to OpenAI')).toBeHidden();
    await page.getByTestId('chat-input').fill('make it 240 wide');
    await page.getByTestId('chat-send').click();
    await expect(page.getByTestId('proposal-card')).toBeVisible();
    await page.waitForTimeout(500);
    expect(calls.speak).toBe(0);
  });

  test('the Voice switch is not offered when the server has voice switched off', async ({ page }) => {
    await mockVoice(page, { enabled: false });
    await openDesigner(page);
    await expect(page.getByTestId('voice-toggle')).toHaveCount(0);
    await expect(page.getByTestId('voice-mic')).toHaveCount(0);
  });

  test('turning Voice on shows the microphone and the privacy note, and off hides them again', async ({ page }) => {
    await mockVoice(page);
    await openDesigner(page);
    await voiceOn(page);
    await expect(page.getByTestId('voice-mic')).toBeVisible();
    await expect(page.getByText('recording is sent to OpenAI')).toBeVisible();
    await expect(page.getByTestId('voice-toggle')).toContainText('On');
    await page.getByTestId('voice-toggle').click();
    await expect(page.getByTestId('voice-mic')).toBeHidden();
    await expect(page.getByTestId('voice-toggle')).toContainText('Off');
  });

  test('while recording the microphone becomes a round red Stop button, with no text', async ({ page }) => {
    await mockVoice(page);
    await openDesigner(page);
    await voiceOn(page);
    const mic = page.getByTestId('voice-mic');
    await expect(mic).toHaveAttribute('aria-label', 'Speak your message');
    await mic.click();
    await expect(mic).toHaveAttribute('aria-label', 'Stop recording');
    await expect(mic).toHaveClass(/chat__mic--recording/);
    await expect(mic).toHaveText(''); // icon only
    await expect(mic.locator('svg path')).toHaveAttribute('d', /^M8 6h8a2 2 0 012 2v8/); // the rounded square stop icon
    const box = await mic.boundingBox();
    expect(Math.abs(box.width - box.height)).toBeLessThan(2); // stays a circle
    await page.waitForTimeout(800);
    await mic.click();
    await expect(mic).toHaveAttribute('aria-label', 'Speak your message');
    await expect(mic).not.toHaveClass(/chat__mic--recording/);
  });

  test('the Voice switch does not crowd the chat header: it has its own row above the composer', async ({ page }) => {
    await mockVoice(page);
    await openDesigner(page);
    await voiceOn(page);
    const header = page.locator('.chat__header');
    await expect(header.getByTestId('voice-toggle')).toHaveCount(0);
    await expect(header.getByText('AI Designer')).toBeVisible();
    await expect(header.getByText('Online')).toBeVisible();
    const fits = await header.evaluate((node) => node.scrollWidth <= node.clientWidth + 1);
    expect(fits).toBe(true);
    const toggle = await page.getByTestId('voice-toggle').boundingBox();
    const composer = await page.locator('.chat__composer').boundingBox();
    expect(toggle.y + toggle.height).toBeLessThanOrEqual(composer.y + 1); // directly above the composer
    const panel = await page.locator('#chat-panel').boundingBox();
    expect(toggle.x).toBeGreaterThanOrEqual(panel.x);
    expect(toggle.x + toggle.width).toBeLessThanOrEqual(panel.x + panel.width);
  });

  test('speaking fills the composer and sends nothing; the reply is read aloud only after Send', async ({ page }) => {
    const calls = await mockVoice(page);
    await openDesigner(page);
    await voiceOn(page);
    await speakIntoComposer(page);
    await expect(page.getByTestId('chat-input')).toHaveValue('make it 240 cm wide');
    expect(calls).toMatchObject({ transcribe: 1, chat: 0, speak: 0 });
    await page.getByTestId('chat-send').click();
    await expect(page.getByTestId('proposal-card')).toBeVisible();
    await expect.poll(() => calls.speak).toBe(1);
  });

  test('with Voice on, every reply is read aloud, even to a typed message', async ({ page }) => {
    const calls = await mockVoice(page);
    await openDesigner(page);
    await voiceOn(page);
    await page.getByTestId('chat-input').fill('make it 240 wide');
    await page.getByTestId('chat-send').click();
    await expect(page.getByTestId('proposal-card')).toBeVisible();
    await expect.poll(() => calls.speak).toBe(1);
    await page.getByTestId('chat-input').fill('and make it white');
    await page.getByTestId('chat-send').click();
    await expect.poll(() => calls.speak).toBe(2);
    expect(calls.transcribe).toBe(0);
  });

  test('turning Voice off stops reading replies', async ({ page }) => {
    const calls = await mockVoice(page);
    await openDesigner(page);
    await voiceOn(page);
    await page.getByTestId('voice-toggle').click();
    await page.getByTestId('chat-input').fill('make it 240 wide');
    await page.getByTestId('chat-send').click();
    await expect(page.getByTestId('proposal-card')).toBeVisible();
    await page.waitForTimeout(500);
    expect(calls.speak).toBe(0);
  });

  test('voice can never confirm: saying "confirm" is just a message, and nothing is applied', async ({ page }) => {
    const calls = await mockVoice(page, { transcript: { text: 'yes confirm and apply it now', noSpeech: false } });
    await openDesigner(page);
    await voiceOn(page);
    const before = await revision(page);
    await speakIntoComposer(page);
    await page.getByTestId('chat-send').click();
    await expect(page.getByTestId('proposal-card')).toBeVisible();
    await expect.poll(() => calls.speak).toBe(1); // the reply is spoken, the design is not changed
    expect(calls.apply).toBe(0);
    expect(await revision(page)).toBe(before);
    await expect(page.getByTestId('proposal-confirm')).toBeEnabled();
  });

  test('a blocked microphone shows a clear message and typing still works', async ({ page }) => {
    await mockVoice(page);
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }));
    });
    await openDesigner(page);
    await voiceOn(page);
    await page.getByTestId('voice-mic').click();
    await expect(page.getByTestId('voice-status')).toContainText('Microphone access is blocked');
    await page.getByTestId('chat-input').fill('hello');
    await expect(page.getByTestId('chat-send')).toBeEnabled();
  });

  test('Escape drops the recording without sending any audio', async ({ page }) => {
    const calls = await mockVoice(page);
    await openDesigner(page);
    await voiceOn(page);
    await page.getByTestId('voice-mic').click();
    await expect(page.getByTestId('voice-status')).toContainText('Listening');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('voice-mic')).toHaveAttribute('aria-pressed', 'false');
    await page.waitForTimeout(300);
    expect(calls.transcribe).toBe(0);
  });

  test('turning Voice off during a recording drops it and sends nothing', async ({ page }) => {
    const calls = await mockVoice(page);
    await openDesigner(page);
    await voiceOn(page);
    await page.getByTestId('voice-mic').click();
    await expect(page.getByTestId('voice-status')).toContainText('Listening');
    await page.getByTestId('voice-toggle').click();
    await expect(page.getByTestId('voice-mic')).toBeHidden();
    await page.waitForTimeout(300);
    expect(calls.transcribe).toBe(0);
  });

  test('silence gets a friendly message and fills nothing', async ({ page }) => {
    await mockVoice(page, { transcript: { text: '', noSpeech: true } });
    await openDesigner(page);
    await voiceOn(page);
    await speakIntoComposer(page);
    await expect(page.getByTestId('voice-status')).toContainText("didn't catch that");
    await expect(page.getByTestId('chat-input')).toHaveValue('');
  });

  test('a paused-budget error from the server is shown in the selected language', async ({ page }) => {
    await mockVoice(page, { transcribe: fail(429, 'VOICE_BUDGET', 'Voice is paused for today. You can keep typing.') });
    await openDesigner(page);
    await voiceOn(page);
    await speakIntoComposer(page);
    await expect(page.getByTestId('voice-status')).toContainText('Voice is paused for today');
    await page.getByTestId('lang-he').click();
    await expect(page.getByTestId('voice-status')).toContainText('הקול מושהה להיום');
  });

  test('the voice controls switch to Hebrew with the assistant language', async ({ page }) => {
    await mockVoice(page);
    await openDesigner(page);
    await voiceOn(page);
    await page.getByTestId('lang-he').click();
    await expect(page.getByTestId('voice-toggle')).toContainText('קול');
    await expect(page.getByTestId('voice-toggle')).toContainText('פעיל');
    await expect(page.getByTestId('voice-mic')).toHaveAttribute('aria-label', 'הקלטת הודעה בקול');
  });

  test('Hebrew text is laid out right to left', async ({ page }) => {
    await mockVoice(page, { transcript: { text: 'תעשה את הארון ברוחב 250 סמ', noSpeech: false } });
    await openDesigner(page);
    await voiceOn(page);
    await speakIntoComposer(page);
    await expect(page.getByTestId('chat-input')).toHaveValue('תעשה את הארון ברוחב 250 סמ');
    await expect(page.getByTestId('chat-input')).toHaveAttribute('dir', 'auto');
    await page.getByTestId('chat-send').click();
    await expect(page.getByTestId('chat-messages').locator('span[dir="auto"]').first()).toContainText('תעשה');
  });

  test('dictation is added after what the customer already typed, never over it', async ({ page }) => {
    await mockVoice(page, { transcript: { text: 'and make it white', noSpeech: false } });
    await openDesigner(page);
    await voiceOn(page);
    await page.getByTestId('chat-input').fill('Make it 240 cm wide');
    await speakIntoComposer(page);
    await expect(page.getByTestId('chat-input')).toHaveValue('Make it 240 cm wide and make it white');
  });
});
