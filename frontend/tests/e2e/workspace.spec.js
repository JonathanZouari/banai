import { clickComponent, expect, openDesigner, showInterior, test } from './fixtures.js';

// The workspace UX on top of the team's chat. The agent is mocked at the network edge (the E2E
// backend has no OpenAI key); the signed-proposal protocol itself is covered by pytest.

const ok = (data) => ({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
const MOVE_SHELF = [{ op: 'modify_shelf', id: 'shf_l2', y: 950 }];

async function mockAgent(page, { ops = MOVE_SHELF } = {}) {
  const calls = [];
  await page.route('**/api/health', (route) => route.fulfill(ok({ status: 'ok', env: 'e2e', agent: true })));
  await page.route('**/api/chat', (route) => {
    const body = route.request().postDataJSON();
    calls.push(body);
    return route.fulfill(ok({
      reply: 'Here is my proposal.',
      proposal: {
        proposalId: 'prp_0123456789abcdef', baseRevision: body.revision, baseHash: 'a'.repeat(64), ops, signature: 'b'.repeat(64),
        summary: 'Moves Shelf 2 up.', changes: [{ title: 'Shelf 2 · Left section', detail: '80.0 cm to 95.0 cm' }],
      },
    }));
  });
  await page.route('**/api/proposals/apply', (route) => {
    const body = route.request().postDataJSON();
    const design = structuredClone(body.design);
    design.compartments[0].shelves.find((s) => s.id === 'shf_l2').y = 950;
    return route.fulfill(ok({ design, revision: body.revision + 1 }));
  });
  return calls;
}

const state = (page) => page.evaluate(() => {
  const { design, revision, selection, proposal, history } = window.__banai.store.getState();
  return { design, revision, selection, proposal: proposal && { stale: proposal.stale, diff: proposal.diff }, history };
});
const shelfY = (page) => page.evaluate(() => window.__banai.store.getState().design.compartments[0].shelves.find((s) => s.id === 'shf_l2').y);

async function propose(page) {
  await page.getByTestId('chat-language-en').click();
  await page.getByTestId('chat-input').fill('Move shelf 2 in the left section 15 cm higher');
  await page.getByTestId('chat-send').click();
  await expect(page.getByTestId('proposal-card')).toBeVisible();
  await expect(page.locator('#preview-badge')).toBeVisible();
}

test.describe('UX: the chat proposal is previewed in 3D', () => {
  test.beforeEach(async ({ page }) => {
    await mockAgent(page);
    await openDesigner(page);
  });

  test('a proposal is shown in 3D without committing anything', async ({ page }) => {
    await propose(page);
    const current = await state(page);
    expect(current.revision).toBe(1);
    expect(await shelfY(page)).toBe(800); // committed design untouched
    expect(current.proposal.diff.modified).toContain('shf_l2');
    await expect(page.locator('#preview-badge')).toContainText('Changed');
    // The 3D view shows the proposed position.
    await expect.poll(() => page.evaluate(() => window.__banai.viewer.meshOf('shf_l2').position.y)).toBeCloseTo(0.018 + 0.95 + 0.009, 3);
  });

  test('Apply in the 3D badge commits through the server and is one undo step', async ({ page }) => {
    await propose(page);
    await page.getByTestId('preview-apply').click();
    await expect.poll(() => shelfY(page)).toBe(950);
    await expect(page.getByTestId('proposal-card')).toHaveCount(0);
    await expect(page.locator('#preview-badge')).toBeHidden();
    expect((await state(page)).revision).toBe(2);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect.poll(() => shelfY(page)).toBe(800);
  });

  test('Cancel in the 3D badge drops the chat proposal and the preview; nothing changes', async ({ page }) => {
    await propose(page);
    const before = await state(page);
    await page.getByTestId('preview-cancel').click();
    await expect(page.getByTestId('proposal-card')).toHaveCount(0);
    await expect(page.locator('#preview-badge')).toBeHidden();
    const after = await state(page);
    expect(after.design).toEqual(before.design);
    expect(after.revision).toBe(before.revision);
    expect(after.proposal).toBeNull();
  });

  test('the selected part is shown as a chip and sent with the message ("this")', async ({ page }) => {
    await page.unrouteAll();
    const calls = await mockAgent(page);
    await page.reload();
    await page.getByTestId('entry-basic').click();
    await page.waitForFunction(() => window.__banai?.viewer.meshOf('shf_l1'));
    await page.evaluate(() => window.__banai.store.select('shf_l2'));
    await expect(page.getByTestId('context-chip')).toContainText('Shelf 2 · Left section');
    await page.getByTestId('chat-language-en').click();
    await page.getByTestId('chat-input').fill('Move this 15 cm higher');
    await page.getByTestId('chat-send').click();
    await expect(page.getByTestId('proposal-card')).toBeVisible();
    expect(calls.at(-1).selection).toEqual({ id: 'shf_l2', kind: 'shelf' });
    await page.getByTestId('context-chip').getByRole('button').click();
    await expect(page.getByTestId('context-chip')).toHaveCount(0);
    expect((await state(page)).selection).toBeNull();
  });

  test('a manual edit while a proposal is pending makes it stale (it cannot overwrite)', async ({ page }) => {
    await propose(page);
    await page.evaluate(() => window.__banai.store.dispatch([{ op: 'modify_shelf', id: 'shf_l1', y: 450 }]));
    await expect(page.locator('#preview-badge')).toBeHidden();
    expect((await state(page)).proposal.stale).toBe(true);
    await expect(page.getByTestId('proposal-card')).toContainText(/changed|re-propose/i);
    expect(await shelfY(page)).toBe(800);
  });
});

test.describe('UX: workspace tools', () => {
  test.beforeEach(async ({ page }) => openDesigner(page));

  test('selecting in 3D shows only that part in the inspector', async ({ page }) => {
    await showInterior(page);
    await clickComponent(page, 'shf_l2');
    await expect(page.locator('#inspector-heading')).toContainText('Shelf 2');
    await expect(page.locator('#inspector-heading')).toContainText('Left section');
    await expect(page.getByTestId('dim-width')).toHaveCount(0); // contextual: no wardrobe fields
    await page.locator('#inspector-heading').getByRole('button', { name: 'Clear selection' }).click();
    await expect(page.getByTestId('dim-width')).toBeVisible();
  });

  test('undo and redo cover manual edits', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
    await page.getByTestId('dim-width').fill('240');
    await page.getByTestId('dim-width').press('Enter');
    await expect.poll(async () => (await state(page)).design.dimensions.width).toBe(2400);
    await page.locator('#viewer canvas').focus();
    await page.keyboard.press('Control+z');
    expect((await state(page)).design.dimensions.width).toBe(2000);
    await page.getByRole('button', { name: 'Redo' }).click();
    expect((await state(page)).design.dimensions.width).toBe(2400);
  });

  test('the structure strip selects sections', async ({ page }) => {
    await page.getByTestId('nav-1').click();
    expect((await state(page)).selection).toEqual({ id: 'cmp_middle', kind: 'compartment' });
    await expect(page.locator('#inspector-heading')).toContainText('Middle section');
    await expect(page.getByTestId('nav-1')).toHaveAttribute('aria-pressed', 'true');
  });

  test('side panels collapse and the 3D view grows', async ({ page }) => {
    const width = () => page.locator('#viewer').evaluate((node) => node.clientWidth);
    const before = await width();
    await page.getByRole('button', { name: 'Collapse assistant' }).click();
    await page.getByRole('button', { name: 'Collapse inspector' }).click();
    await expect.poll(width).toBeGreaterThan(before + 400);
    await page.getByRole('button', { name: 'Expand assistant' }).click();
    await expect(page.getByTestId('chat-input')).toBeVisible();
  });

  test('the dimensions toggle hides and shows labels', async ({ page }) => {
    await expect(page.getByText('W 200.0 cm', { exact: true })).toBeVisible();
    await page.getByTestId('view-dimensions').click();
    await expect(page.getByText('W 200.0 cm', { exact: true })).toHaveCount(0);
    await page.getByTestId('view-dimensions').click();
    await expect(page.getByText('W 200.0 cm', { exact: true })).toBeVisible();
  });

  test('duplicate copies the selected shelf into its section', async ({ page }) => {
    await showInterior(page);
    await clickComponent(page, 'shf_r1');
    await page.getByTestId('duplicate-selected').click();
    await expect.poll(async () => (await state(page)).design.compartments[2].shelves.length).toBe(3);
  });

  test('clicking a door opens it (with its handle) and clicking again closes it, without a design edit', async ({ page }) => {
    const { revision } = await state(page);
    const pose = () => page.evaluate(() => {
      const { viewer } = window.__banai;
      const door = viewer.meshOf('dr_middle');
      const handle = door.parent.children.find((m) => m.userData.doorId === 'dr_middle' && m.userData.part === 'handle');
      return { door: door.rotation.y, handle: handle.rotation.y };
    });
    await clickComponent(page, 'dr_middle');
    expect(await page.evaluate(() => window.__banai.viewer.isDoorOpen('dr_middle'))).toBe(true);
    await expect.poll(async () => (await pose()).door).toBeGreaterThan(1.7);
    const opened = await pose();
    expect(opened.handle).toBeCloseTo(opened.door, 5); // the handle moves with the door
    await clickComponent(page, 'dr_middle');
    await expect.poll(async () => (await pose()).door).toBe(0);
    expect((await state(page)).revision).toBe(revision);
  });

  test('a door can be switched to a mirror front and back (undoable)', async ({ page }) => {
    await clickComponent(page, 'dr_left');
    await page.getByTestId('door-front').getByRole('button', { name: 'Mirror' }).click();
    const material = () => page.evaluate(() => window.__banai.store.getState().design.doors.items[0].appearance?.material ?? null);
    await expect.poll(material).toEqual({ catalogId: 'mirror' });
    await expect.poll(() => page.evaluate(() => window.__banai.viewer.meshOf('dr_left').material.metalness)).toBe(1);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect.poll(material).toBeNull();
  });

  test('the room style changes the view, not the design', async ({ page }) => {
    const { revision } = await state(page);
    await page.getByTestId('room-button').click();
    await page.getByRole('button', { name: 'Sage walls' }).click();
    await page.getByTestId('floor-walnut').click();
    expect(await page.evaluate(() => window.__banai.store.getState().ui.room)).toEqual({ wall: '#c6d0bd', floor: 'walnut' });
    expect((await state(page)).revision).toBe(revision);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('room-panel')).toBeHidden();
  });

  test('Save and Render open their dialogs without changing the design', async ({ page }) => {
    const before = await state(page);
    await page.getByTestId('open-save').click();
    await expect(page.getByTestId('save-dialog')).toBeVisible();
    await page.getByTestId('save-close').click();
    await page.getByTestId('open-render').click();
    await expect(page.getByRole('dialog')).toContainText(/render/i);
    await page.keyboard.press('Escape');
    expect((await state(page)).revision).toBe(before.revision);
  });
});
