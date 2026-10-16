import { test, expect, openDesigner } from './fixtures.js';

// The agent endpoints are mocked here: this suite checks the UI <-> state sync, not OpenAI.
const ok = (data) => ({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
const fail = (status, code, message) => ({ status, contentType: 'application/json', body: JSON.stringify({ success: false, data: null, error: { code, message } }) });
const proposalFor = (revision) => ({
  ops: [{ op: 'update_dimensions', width: 2400 }], summary: 'Make it 240 cm wide', baseRevision: revision,
  baseHash: 'a'.repeat(64), signature: 'b'.repeat(64),
});
const state = (page) => page.evaluate(() => { const s = window.__banai.store.getState(); return { revision: s.revision, width: s.design.dimensions.width }; });

async function mockChat(page, revision = 1) {
  await page.route('**/api/chat', (route) => route.fulfill(ok({ reply: 'Here you go.', proposal: proposalFor(revision) })));
}
const send = async (page, text) => { await page.getByTestId('chat-input').fill(text); await page.getByTestId('chat-send').click(); };

test.describe('AI chat <-> design sync', () => {
  test('a proposal is shown but nothing changes until Confirm', async ({ page }) => {
    await mockChat(page);
    await openDesigner(page);
    await send(page, 'make it 240 wide');
    await expect(page.getByTestId('proposal-card')).toBeVisible();
    expect(await state(page)).toEqual({ revision: 1, width: 2000 });
  });

  test('Confirm applies the server result to the store, viewer and editor', async ({ page }) => {
    await mockChat(page);
    await page.route('**/api/proposals/apply', async (route) => {
      const sent = route.request().postDataJSON();
      const design = structuredClone(sent.design);
      design.dimensions.width = 2400;
      design.compartments[2].width += 400;
      await route.fulfill(ok({ design, revision: sent.revision + 1 }));
    });
    await openDesigner(page);
    await send(page, 'make it 240 wide');
    await page.getByTestId('proposal-confirm').click();
    await expect(page.getByTestId('proposal-card')).toHaveCount(0);
    expect(await state(page)).toEqual({ revision: 2, width: 2400 });
    await expect(page.getByText('W 240.0 cm', { exact: true })).toBeVisible();
    await expect(page.getByTestId('chat-messages')).toContainText('Changes applied');
  });

  test('Cancel changes nothing', async ({ page }) => {
    await mockChat(page);
    await openDesigner(page);
    await send(page, 'make it 240 wide');
    await page.getByTestId('proposal-cancel').click();
    await expect(page.getByTestId('proposal-card')).toHaveCount(0);
    expect(await state(page)).toEqual({ revision: 1, width: 2000 });
  });

  test('a manual edit makes the pending proposal stale and Confirm is disabled', async ({ page }) => {
    await mockChat(page);
    await openDesigner(page);
    await send(page, 'make it 240 wide');
    await page.getByTestId('proposal-card').waitFor();
    await page.evaluate(() => window.__banai.store.dispatch([{ op: 'update_dimensions', height: 2300 }]));
    await expect(page.getByTestId('proposal-confirm')).toBeDisabled();
    await expect(page.getByText('Design changed. Ask the agent to re-propose.').first()).toBeVisible();
  });

  test('a 409 from the server is shown as stale and the design is untouched', async ({ page }) => {
    await mockChat(page);
    await page.route('**/api/proposals/apply', (route) => route.fulfill(fail(409, 'STALE', 'Design changed. Ask the agent to re-propose.')));
    await openDesigner(page);
    await send(page, 'make it 240 wide');
    await page.getByTestId('proposal-confirm').click();
    await expect(page.getByTestId('chat-messages')).toContainText('Design changed');
    expect(await state(page)).toEqual({ revision: 1, width: 2000 });
  });

  test('a backend failure is reported honestly and the design is untouched', async ({ page }) => {
    await page.route('**/api/chat', (route) => route.fulfill(fail(502, 'AGENT_UNAVAILABLE', 'The AI agent is unavailable. Please try again.')));
    await openDesigner(page);
    await send(page, 'hello');
    await expect(page.getByTestId('chat-messages')).toContainText('unavailable');
    await expect(page.getByTestId('proposal-card')).toHaveCount(0);
    expect(await state(page)).toEqual({ revision: 1, width: 2000 });
  });
});

test.describe('Undo', () => {
  test('is disabled at the start, reverses a manual edit and an applied proposal, and stales a pending proposal', async ({ page }) => {
    await page.route('**/api/chat', (route) => route.fulfill(ok({ reply: 'Here you go.', proposal: proposalFor(route.request().postDataJSON().revision) })));
    await page.route('**/api/proposals/apply', async (route) => {
      const sent = route.request().postDataJSON();
      const design = structuredClone(sent.design);
      design.dimensions.width = 2400;
      design.compartments[2].width += 400;
      await route.fulfill(ok({ design, revision: sent.revision + 1 }));
    });
    await openDesigner(page);
    await expect(page.getByTestId('undo')).toBeDisabled();
    await page.evaluate(() => window.__banai.store.dispatch([{ op: 'update_dimensions', height: 2300 }]));
    await expect(page.getByTestId('undo')).toBeEnabled();
    await page.getByTestId('undo').click();
    expect(await state(page)).toEqual({ revision: 3, width: 2000 });
    await expect(page.getByTestId('undo')).toBeDisabled();
    await send(page, 'make it 240 wide');
    await page.getByTestId('proposal-confirm').click();
    await expect(page.getByText('W 240.0 cm', { exact: true })).toBeVisible();
    await send(page, 'again');
    await page.getByTestId('proposal-card').waitFor();
    await page.getByTestId('undo').click();
    await expect(page.getByText('W 200.0 cm', { exact: true })).toBeVisible();
    await expect(page.getByTestId('proposal-confirm')).toBeDisabled();
    await expect(page.getByTestId('chat-messages')).toContainText('Last change undone');
  });
});
