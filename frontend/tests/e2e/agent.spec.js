// Phase 5: chat -> signed proposal -> Confirm / Cancel / stale. The backend is the real app with a
// scripted stand-in for OpenAI (backend/tests/e2e_app.py), so the whole protocol runs for real.
import { expect, openDesigner, test } from './fixtures.js';

// These specs read the English chat; the app starts in Hebrew, so ask for English like a returning customer would.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('banai.chat.language', 'en'));
});

const state = (page) => page.evaluate(() => {
  const { design, revision } = window.__banai.store.getState();
  return { revision, design };
});
const ask = async (page, text) => {
  await page.getByTestId('chat-input').fill(text);
  await page.getByTestId('chat-send').click();
};
const shelvesIn = (design, id) => design.compartments.find((c) => c.id === id).shelves.length;

test.describe('AI agent', () => {
  test('a request shows a proposal that changes nothing until Confirm', async ({ page }) => {
    await openDesigner(page);
    const before = await state(page);
    await ask(page, 'please add a shelf in the middle');

    await expect(page.getByTestId('chat-messages')).toContainText('I added a shelf to the middle compartment.');
    const card = page.getByTestId('proposal-card');
    await expect(card).toContainText('Add shelf');
    await expect(card).toContainText('In compartment 2, 50 cm from the bottom.');
    await expect(page.getByTestId('proposal-confirm')).toBeEnabled();
    expect(await state(page)).toEqual(before); // pending proposals never touch the committed design

    await page.getByTestId('proposal-confirm').click();
    await expect(page.getByTestId('chat-messages')).toContainText('Applied. Your design has been updated.');
    await expect(card).toHaveCount(0);
    const after = await state(page);
    expect(after.revision).toBe(before.revision + 1);
    expect(shelvesIn(after.design, 'cmp_middle')).toBe(shelvesIn(before.design, 'cmp_middle') + 1);
  });

  test('Cancel drops the proposal and leaves the design alone', async ({ page }) => {
    await openDesigner(page);
    const before = await state(page);
    await ask(page, 'make the wardrobe wider');
    await expect(page.getByTestId('proposal-card')).toContainText('Change size');
    await page.getByTestId('proposal-cancel').click();
    await expect(page.getByTestId('proposal-card')).toHaveCount(0);
    await expect(page.getByTestId('chat-messages')).toContainText('No changes were made');
    expect(await state(page)).toEqual(before);
  });

  test('a manual edit makes the proposal stale and Confirm is blocked', async ({ page }) => {
    await openDesigner(page);
    await ask(page, 'switch to sliding doors');
    await expect(page.getByTestId('proposal-card')).toContainText('Sliding doors');
    await page.getByTestId('dim-width').fill('210');
    await page.getByTestId('dim-width').press('Enter');
    await expect(page.getByTestId('proposal-card')).toContainText('Design changed. Ask the designer to re-propose.');
    await expect(page.getByTestId('proposal-confirm')).toBeDisabled();
    const after = await state(page);
    expect(after.design.doors.type).toBe('hinged');
  });

  test('the server refuses a proposal whose design moved on, and nothing is applied (409)', async ({ page }) => {
    await openDesigner(page);
    await ask(page, 'add a shelf please');
    await expect(page.getByTestId('proposal-confirm')).toBeEnabled();
    // Edit the design behind the card's back: the card cannot know, only the server's hash check can.
    const stale = await page.evaluate(async () => {
      const { store, chat } = window.__banai;
      const raw = chat.getProposal().raw;
      const { design } = store.getState();
      const edited = structuredClone(design);
      edited.compartments[0].shelves[0].y += 10; // a valid edit, so only the hash check can object
      const response = await fetch('http://localhost:8010/api/proposals/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ design: edited, revision: raw.baseRevision, proposal: raw }),
      });
      return { status: response.status, code: (await response.json()).error.code };
    });
    expect(stale).toEqual({ status: 409, code: 'STALE' });
  });

  test('a tampered proposal is refused by the server (403)', async ({ page }) => {
    await openDesigner(page);
    await ask(page, 'add a shelf please');
    await expect(page.getByTestId('proposal-confirm')).toBeEnabled();
    const result = await page.evaluate(async () => {
      const { store, chat } = window.__banai;
      const raw = structuredClone(chat.getProposal().raw);
      raw.ops[0].y = 900;
      const { design, revision } = store.getState();
      const response = await fetch('http://localhost:8010/api/proposals/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ design, revision, proposal: raw }),
      });
      return { status: response.status, code: (await response.json()).error.code };
    });
    expect(result).toEqual({ status: 403, code: 'INVALID_SIGNATURE' });
  });

  test('a clarifying question and a plain answer produce no proposal', async ({ page }) => {
    await openDesigner(page);
    await ask(page, 'make it nicer');
    await expect(page.getByTestId('chat-messages')).toContainText('What would make it nicer');
    await ask(page, 'hello there');
    await expect(page.getByTestId('chat-messages')).toContainText('I can help with shelves, doors and sizes.');
    await expect(page.getByTestId('proposal-card')).toHaveCount(0);
  });

  test('an unfixable request ends with a clarification, never a half-applied change', async ({ page }) => {
    await openDesigner(page);
    const before = await state(page);
    await ask(page, 'do the broken thing');
    await expect(page.getByTestId('chat-messages')).toContainText("couldn't turn that into a valid change");
    await expect(page.getByTestId('proposal-card')).toHaveCount(0);
    expect(await state(page)).toEqual(before);
  });

  test('the composer is disabled while the agent is thinking', async ({ page }) => {
    await openDesigner(page);
    // Hold the request until the test lets it go, so the thinking state is observable on any machine.
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    await page.route('**/api/chat', async (route) => {
      await gate;
      await route.continue();
    });
    await ask(page, 'hello');
    await expect(page.getByTestId('chat-typing')).toBeVisible();
    await expect(page.getByTestId('chat-send')).toBeDisabled();
    release();
    await expect(page.getByTestId('chat-typing')).toBeHidden();
    await expect(page.getByTestId('chat-send')).toBeEnabled();
  });

  test('a service error shows a friendly note and the designer keeps working', async ({ page }) => {
    await openDesigner(page);
    await page.route('**/api/chat', (route) => route.fulfill({
      status: 503, contentType: 'application/json',
      body: JSON.stringify({ success: false, data: null, error: { code: 'AGENT_UNAVAILABLE', message: 'The AI designer is not configured on this server.' } }),
    }));
    await ask(page, 'hello');
    await expect(page.getByTestId('chat-messages')).toContainText('not configured on this server');
    await expect(page.getByTestId('chat-send')).toBeEnabled();
  });
});
