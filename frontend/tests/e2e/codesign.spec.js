// Phase 6: integrated co-design. Spec section 21, steps 1-16, through the real app and the real backend
// (only the LLM is scripted, backend/tests/e2e_app.py). Plus the three entry paths and the manual/AI rules.
import { clickComponent, expect, test } from './fixtures.js';

const DESCRIPTION = '240 cm wide, 260 cm tall, three compartments, four shelves left, hanging middle, three drawers right';

const state = (page) => page.evaluate(() => {
  const { design, revision } = window.__banai.store.getState();
  return { revision, design };
});
const ask = async (page, text) => {
  await page.getByTestId('chat-input').fill(text);
  await page.getByTestId('chat-send').click();
};
const waitForViewer = (page) => page.waitForFunction(() => window.__banai?.viewer);
const chatCalls = (page) => {
  const calls = [];
  page.on('request', (request) => {
    if (request.url().endsWith('/api/chat')) calls.push(JSON.parse(request.postData()));
  });
  return calls;
};
const meshY = (page, id) => page.evaluate((meshId) => window.__banai.viewer.meshOf(meshId).position.y, id);

test.describe('Phase 6: acceptance scenario (spec 21, steps 1-16)', () => {
  test('describe, approve, inspect, edit by hand, ask again, approve: everything stays consistent', async ({ page }) => {
    const calls = chatCalls(page);
    // 1-2. Open the designer and start with a free-text description.
    await page.goto('/');
    await page.getByTestId('entry-freeText').click();
    await waitForViewer(page);
    const starter = await state(page);
    await ask(page, DESCRIPTION);

    // 3-4. The AI interprets it and presents a structured proposal; nothing is committed yet.
    const card = page.getByTestId('proposal-card');
    await expect(card).toContainText('New wardrobe');
    expect(await state(page)).toEqual(starter);
    expect(calls).toHaveLength(1);
    expect(calls[0].mode).toBe('free');

    // 5-6. The customer approves; the 3D wardrobe appears and the starter is gone.
    await page.getByTestId('proposal-confirm').click();
    await expect(page.getByTestId('chat-messages')).toContainText('Changes applied.');
    const built = await state(page);
    expect(built.revision).toBe(starter.revision + 1);
    expect(built.design.dimensions).toMatchObject({ width: 2400, height: 2600 });
    expect(built.design.compartments.map((c) => [c.id, c.shelves.length, c.rails.length, c.drawers.length]))
      .toEqual([['cmp_a', 4, 0, 0], ['cmp_b', 0, 1, 0], ['cmp_c', 0, 0, 3]]);
    const shelf = built.design.compartments[0].shelves[0];
    await page.waitForFunction((id) => Boolean(window.__banai.viewer.meshOf(id)), shelf.id);

    // 7. The customer rotates and inspects it.
    const before = await page.evaluate(() => window.__banai.viewer.camera.position.toArray());
    const box = await page.locator('#viewer canvas').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 20, { steps: 8 });
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => window.__banai.viewer.camera.position.toArray())).not.toEqual(before);

    // 8-9. The customer selects a shelf; the editor shows its dimensions.
    await page.getByLabel('Show interior').check();
    await clickComponent(page, shelf.id);
    await expect(page.getByTestId('shelf-y')).toHaveValue('40.0');

    // 10-11. The customer moves the shelf by hand: no AI call, and the 3D model follows.
    const callsBeforeEdit = calls.length;
    const meshBefore = await meshY(page, shelf.id);
    await page.getByTestId('shelf-y').fill('55');
    await page.getByTestId('shelf-y').press('Enter');
    await expect.poll(async () => (await state(page)).design.compartments[0].shelves[0].y).toBe(550);
    await expect.poll(() => meshY(page, shelf.id)).toBeGreaterThan(meshBefore);
    expect(calls).toHaveLength(callsBeforeEdit); // the agent never reacts to a manual edit
    const afterManual = await meshY(page, shelf.id);

    // 12-14. The customer asks for a change. The request carries the manual edit and the AI builds on it.
    await ask(page, 'raise the first shelf a bit');
    await expect(card).toContainText('y 65 cm');
    expect(calls).toHaveLength(callsBeforeEdit + 1);
    expect(calls.at(-1).design.compartments[0].shelves[0].y).toBe(550);
    expect(calls.at(-1).revision).toBe((await state(page)).revision);
    expect((await state(page)).design.compartments[0].shelves[0].y).toBe(550); // still the committed value

    // 15-16. The customer approves; the model and the editor show the same new value.
    await page.getByTestId('proposal-confirm').click();
    await expect(page.getByTestId('chat-messages')).toContainText('Changes applied.');
    await expect.poll(async () => (await state(page)).design.compartments[0].shelves[0].y).toBe(650);
    await expect(page.getByTestId('shelf-y')).toHaveValue('65.0');
    await expect.poll(() => meshY(page, shelf.id)).toBeGreaterThan(afterManual);
  });
});

test.describe('Phase 6: entry paths and concurrency', () => {
  test('guided entry greets without calling the AI, then sends guided requests', async ({ page }) => {
    const calls = chatCalls(page);
    await page.goto('/');
    await page.getByTestId('entry-guided').click();
    await waitForViewer(page);
    await expect(page.getByTestId('chat-messages')).toContainText('how wide and how tall');
    expect(calls).toHaveLength(0);
    await ask(page, '240 wide and 260 tall');
    await expect(page.getByTestId('chat-messages')).toContainText('How many compartments would you like?');
    expect(calls).toHaveLength(1);
    expect(calls[0].mode).toBe('guided');
    await expect(page.getByTestId('proposal-card')).toHaveCount(0);
  });

  test('the basic wardrobe is a starting point that the AI can edit', async ({ page }) => {
    const calls = chatCalls(page);
    await page.goto('/');
    await page.getByTestId('entry-basic').click();
    await waitForViewer(page);
    expect((await state(page)).design.dimensions.width).toBe(2000);
    await ask(page, 'make it wider');
    await page.getByTestId('proposal-confirm').click();
    await expect(page.getByTestId('chat-messages')).toContainText('Changes applied.');
    expect((await state(page)).design.dimensions.width).toBe(2400);
    expect(calls[0].mode).toBe('free');
  });

  test('a manual edit makes a waiting proposal stale, and the next request builds on the edit', async ({ page }) => {
    const calls = chatCalls(page);
    await page.goto('/');
    await page.getByTestId('entry-basic').click();
    await waitForViewer(page);
    await ask(page, 'switch to sliding doors');
    await expect(page.getByTestId('proposal-confirm')).toBeEnabled();
    await page.getByTestId('dim-width').fill('210');
    await page.getByTestId('dim-width').press('Enter');
    await expect(page.getByTestId('proposal-confirm')).toBeDisabled();
    await ask(page, 'switch to sliding doors again');
    await expect(page.getByTestId('proposal-confirm')).toBeEnabled();
    expect(calls.at(-1).design.dimensions.width).toBe(2100);
    await page.getByTestId('proposal-confirm').click();
    await expect(page.getByTestId('chat-messages')).toContainText('Changes applied.');
    const after = await state(page);
    expect(after.design.doors.type).toBe('sliding');
    expect(after.design.dimensions.width).toBe(2100); // the manual change survived the AI change
  });
});
