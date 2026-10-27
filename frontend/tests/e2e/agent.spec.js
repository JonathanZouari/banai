import { chooseSetting, expect, openDesigner, test } from './fixtures.js';

// The agent flow end to end in the browser. The network edge is mocked (the E2E backend has no
// OpenAI key, so it never calls OpenAI); the signed-proposal protocol itself is covered by pytest.

const ok = (data) => ({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });

async function mockAgent(page, { applyStatus = 200 } = {}) {
  const calls = { chat: [], apply: [] };
  await page.route('**/api/health', (route) => route.fulfill(ok({ status: 'ok', env: 'e2e', agent: true, storage: true })));
  await page.route('**/api/chat', async (route) => {
    const body = route.request().postDataJSON();
    calls.chat.push(body);
    await new Promise((resolve) => setTimeout(resolve, 400)); // long enough to see the typing indicator
    const english = body.language === 'en'; // like the real agent, reply in the chosen language
    await route.fulfill(ok({
      reply: english ? 'Sure! Here is my proposal.' : 'אפשר! הנה ההצעה שלי.',
      replySignature: 'c'.repeat(64),
      proposal: {
        proposalId: 'prp_0123456789abcdef', baseRevision: body.revision, baseHash: 'a'.repeat(64),
        ops: [{ op: 'update_dimensions', depth: 550 }], signature: 'b'.repeat(64),
        summary: 'Makes the wardrobe shallower.', changes: [{ title: 'Depth', detail: '60.0 cm to 55.0 cm' }],
      },
    }));
  });
  await page.route('**/api/proposals/apply', async (route) => {
    const body = route.request().postDataJSON();
    calls.apply.push(body);
    if (applyStatus !== 200) {
      await route.fulfill({ status: applyStatus, contentType: 'application/json', body: JSON.stringify({ success: false, error: { code: 'STALE', message: 'Design changed' } }) });
      return;
    }
    const design = structuredClone(body.design);
    design.dimensions.depth = 550;
    await route.fulfill(ok({ design, revision: body.revision + 1 }));
  });
  return calls;
}

const revision = (page) => page.evaluate(() => window.__banai.store.getState().revision);
const depth = (page) => page.evaluate(() => window.__banai.store.getState().design.dimensions.depth);

test.describe('AI designer (agent connected)', () => {
  test('a Hebrew message switches the app to Hebrew; Confirm applies the proposal', async ({ page }) => {
    const calls = await mockAgent(page);
    await openDesigner(page);
    await expect(page.getByTestId('lang-en')).toHaveAttribute('aria-checked', 'true');

    await page.getByTestId('chat-input').fill('תעשה אותו פחות עמוק, 55 ס"מ');
    await page.getByTestId('chat-send').click();
    await expect(page.locator('#chat-panel')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByTestId('chat-send')).toBeDisabled();

    const messages = page.getByTestId('chat-messages');
    await expect(messages).toContainText('אפשר! הנה ההצעה שלי.');
    await expect(page.getByTestId('proposal-card')).toBeVisible();
    expect(calls.chat[0]).toMatchObject({ messages: [{ role: 'user', text: 'תעשה אותו פחות עמוק, 55 ס"מ' }], revision: 1, language: 'he', units: 'cm' });
    expect(await depth(page)).toBe(600); // nothing applied before Confirm

    await page.getByTestId('proposal-confirm').click();
    await expect(page.getByTestId('proposal-card')).toHaveCount(0);
    expect(await depth(page)).toBe(550);
    expect(await revision(page)).toBe(2);
    expect(calls.apply[0].proposal).toMatchObject({ proposalId: 'prp_0123456789abcdef', signature: 'b'.repeat(64) }); // sent back unchanged
    expect(calls.apply[0].proposal).not.toHaveProperty('id');
    await expect(page.getByTestId('profile-note')).toHaveCount(1); // the PDF step after a confirmed change
  });

  test('writing in English switches back, and each message is sent exactly once', async ({ page }) => {
    const calls = await mockAgent(page);
    await openDesigner(page);
    await chooseSetting(page, 'lang-he');

    await page.getByTestId('chat-input').fill('make it shallower please');
    await page.getByTestId('chat-send').click();
    await expect(page.locator('#chat-panel')).toHaveAttribute('dir', 'ltr');
    await expect(page.getByTestId('chat-messages')).toContainText('Sure! Here is my proposal.');
    await expect(page.getByTestId('chat-input')).toHaveValue(''); // sent, not left behind
    expect(calls.chat[0].language).toBe('en');

    await page.getByTestId('proposal-cancel').click();
    await page.getByTestId('chat-input').fill('240?'); // no letters: the current language decides
    await page.getByTestId('chat-send').click();
    await expect(page.locator('.chat__bubble--assistant:not(.chat__typing)')).toHaveCount(2);
    expect(calls.chat[1].language).toBe('en');
    expect(calls.chat).toHaveLength(2);
  });

  test('switching language never changes the messages already on screen', async ({ page }) => {
    await mockAgent(page);
    await openDesigner(page);
    const bubbles = () => page.locator('.chat__bubble:not(.chat__typing)').evaluateAll((nodes) => nodes.map((n) => ({ text: n.textContent, dir: n.getAttribute('dir') })));

    await page.getByTestId('chat-input').fill('תעשה אותו פחות עמוק');
    await page.getByTestId('chat-send').click();
    await expect(page.locator('.chat__bubble--assistant:not(.chat__typing)')).toHaveCount(1);
    const hebrewTurn = await bubbles();
    expect(hebrewTurn.at(-1)).toEqual({ text: 'אפשר! הנה ההצעה שלי.', dir: 'rtl' });

    await chooseSetting(page, 'lang-en');
    await expect(page.locator('#chat-panel')).toHaveAttribute('dir', 'ltr');
    expect(await bubbles()).toEqual(hebrewTurn);
  });

  test.describe('when the design changed on the server side', () => {
    test.use({ allowedConsoleErrors: [/status of 409 \(Conflict\)/] });

    test('a stale proposal is refused by the server and nothing changes', async ({ page }) => {
      await mockAgent(page, { applyStatus: 409 });
      await openDesigner(page);
      await page.getByTestId('chat-input').fill('make it shallower');
      await page.getByTestId('chat-send').click();
      await expect(page.getByTestId('proposal-card')).toBeVisible();
      await page.getByTestId('proposal-confirm').click();
      await expect(page.getByTestId('chat-messages')).toContainText('Design changed. Ask the agent to re-propose.');
      expect(await depth(page)).toBe(600);
      expect(await revision(page)).toBe(1);
    });
  });
});
