// Voice chat: a fake microphone (Chromium flags in playwright.config.js) and a scripted OpenAI stand-in
// for transcription and speech (backend/tests/e2e_app.py). Voice must behave exactly like typing.
import { expect, openDesigner, test } from './fixtures.js';

const state = (page) => page.evaluate(() => {
  const { design, revision } = window.__banai.store.getState();
  return { revision, design };
});

test.describe('voice chat', () => {
  test('press to record, press again: the transcript is sent like a typed message and only proposes', async ({ page }) => {
    await openDesigner(page);
    const before = await state(page);
    await page.getByTestId('voice-mic').click();
    await expect(page.getByTestId('voice-status')).toContainText('Listening');
    await expect(page.getByTestId('voice-mic')).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(700); // let the fake microphone produce some audio
    await page.getByTestId('voice-mic').click();

    await expect(page.getByTestId('chat-messages')).toContainText('please add a shelf in the middle');
    await expect(page.getByTestId('proposal-card')).toContainText('Add shelf');
    await expect(page.getByTestId('voice-mic')).toHaveAttribute('aria-pressed', 'false');
    expect(await state(page)).toEqual(before); // speaking never applies anything: Confirm is still a click

    await page.getByTestId('proposal-confirm').click();
    await expect(page.getByTestId('chat-messages')).toContainText('Changes applied.');
    expect((await state(page)).revision).toBe(before.revision + 1);
  });

  test('a denied microphone shows a clear note and typing still works', async ({ page }) => {
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' }));
    });
    await openDesigner(page);
    await page.getByTestId('voice-mic').click();
    await expect(page.getByTestId('voice-status')).toContainText('Microphone access was denied');
    await page.getByTestId('chat-input').fill('hello there');
    await page.getByTestId('chat-send').click();
    await expect(page.getByTestId('chat-messages')).toContainText('I can help with shelves, doors and sizes.');
  });

  test('a transcription failure shows a friendly note and sends nothing', async ({ page }) => {
    await openDesigner(page);
    await page.route('**/api/voice/transcribe', (route) => route.fulfill({
      status: 503, contentType: 'application/json',
      body: JSON.stringify({ success: false, data: null, error: { code: 'VOICE_UNAVAILABLE', message: 'x' } }),
    }));
    await page.getByTestId('voice-mic').click();
    await page.waitForTimeout(500);
    await page.getByTestId('voice-mic').click();
    await expect(page.getByTestId('voice-status')).toContainText('Voice is not available right now');
    await expect(page.getByTestId('chat-messages')).toBeHidden();
    await expect(page.getByTestId('voice-mic')).toBeEnabled();
  });

  test('"Read replies aloud" is off by default, asks for speech only when on, and is remembered', async ({ page }) => {
    await openDesigner(page);
    const toggle = page.getByTestId('voice-speak-toggle');
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    const speakCalls = [];
    page.on('request', (request) => { if (request.url().endsWith('/api/voice/speak')) speakCalls.push(request.postData()); });

    await page.getByTestId('chat-input').fill('hello');
    await page.getByTestId('chat-send').click();
    await expect(page.getByTestId('chat-messages')).toContainText('I can help with shelves');
    expect(speakCalls).toEqual([]);

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await page.getByTestId('chat-input').fill('hello again');
    await page.getByTestId('chat-send').click();
    await expect.poll(() => speakCalls.length).toBe(1);
    expect(JSON.parse(speakCalls[0]).text).toContain('I can help with shelves');

    await page.reload();
    await page.getByTestId('entry-basic').click();
    await expect(page.getByTestId('voice-speak-toggle')).toHaveAttribute('aria-checked', 'true');
  });

  test('a proposal is read aloud with its changes, and the privacy note is visible', async ({ page }) => {
    await openDesigner(page);
    await expect(page.getByText('Recordings and read-aloud text are sent to OpenAI.')).toBeVisible();
    await page.getByTestId('voice-speak-toggle').click();
    const speak = page.waitForRequest((request) => request.url().endsWith('/api/voice/speak'));
    await page.getByTestId('chat-input').fill('add a shelf please');
    await page.getByTestId('chat-send').click();
    const text = JSON.parse((await speak).postData()).text;
    expect(text).toContain('Add shelf');
    expect(text.length).toBeLessThanOrEqual(600);
  });
});
