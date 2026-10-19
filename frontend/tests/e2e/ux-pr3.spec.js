import { test, expect, openChat, openDesigner } from './fixtures.js';

test.describe('start screen', () => {
  test('is shown first with three entry points and the manufacturing disclaimer', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('start-screen')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'מתכננים ארון' })).toBeVisible();
    for (const id of ['guided', 'freeText', 'basic']) await expect(page.getByTestId(`entry-${id}`)).toBeVisible();
    await expect(page.getByText('הנגר מאמת את המידות באתר')).toBeVisible();
  });

  test('Escape does not dismiss it (a choice is required)', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('start-screen').waitFor();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('start-screen')).toBeVisible();
  });

  test('"Start from a basic wardrobe" opens the editor with the default wardrobe', async ({ page }) => {
    await openDesigner(page);
    await expect(page.getByTestId('start-screen')).toHaveCount(0);
    await expect(page.getByText('רוחב 200.0 ס״מ', { exact: true })).toBeVisible();
  });

  test('"Describe it" opens the same editor and focuses the chat composer', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('entry-freeText').click();
    await expect(page.getByTestId('chat-input')).toBeFocused();
    await expect(page.getByTestId('chat-input')).toHaveAttribute('placeholder', /רוחב 240/);
    await page.waitForFunction(() => window.__banai?.viewer.meshOf('shf_l1'));
  });
});

test.describe('AI chat panel (agent not connected yet)', () => {
  test('sending a message gets an honest reply and never changes the design', async ({ page }) => {
    await openDesigner(page);
    await openChat(page);
    const before = await page.evaluate(() => window.__banai.store.getState().revision);
    await page.getByTestId('chat-input').fill('make it 3 m wide');
    await page.getByTestId('chat-send').click();
    const messages = page.getByTestId('chat-messages');
    await expect(messages).toContainText('make it 3 m wide');
    await expect(messages).toContainText('עוד לא מחובר');
    expect(await page.evaluate(() => window.__banai.store.getState().revision)).toBe(before);
  });

  test('a proposal shows Confirm/Cancel, goes stale after a manual edit, and Cancel changes nothing', async ({ page }) => {
    await openDesigner(page);
    await openChat(page);
    await page.evaluate(() => {
      const { chat, store } = window.__banai;
      chat.setProposal({
        id: 'demo', baseRevision: store.getState().revision, summary: 'Widen the wardrobe',
        changes: [{ title: 'Width', detail: '200.0 cm to 240.0 cm' }],
      });
    });
    const card = page.getByTestId('proposal-card');
    await expect(card).toContainText('שינויים מוצעים');
    await expect(page.getByTestId('proposal-confirm')).toBeEnabled();

    await page.getByTestId('dim-width').fill('210');
    await page.getByTestId('dim-width').press('Enter');
    await expect(card).toContainText('התכנון השתנה מאז ההצעה. בקשו הצעה חדשה.');
    await expect(page.getByTestId('proposal-confirm')).toBeDisabled();

    const revision = await page.evaluate(() => window.__banai.store.getState().revision);
    await page.getByTestId('proposal-cancel').click();
    await expect(card).toHaveCount(0);
    await expect(page.getByTestId('chat-messages')).toContainText('התכנון לא השתנה');
    expect(await page.evaluate(() => window.__banai.store.getState().revision)).toBe(revision);
  });
});

// PR #3 look-and-feel tests (logo, fonts, chevron, ripple) were removed with that restyle (ADR-013).
test.describe('look and feel', () => {
  test('the chat is a conversation: no starter chips or multiple choice (ADR-025)', async ({ page }) => {
    await openDesigner(page);
    await openChat(page);
    const welcome = page.getByTestId('chat-welcome');
    await expect(welcome).toBeVisible();
    await expect(page.locator('.suggestion, [data-testid="suggestion"]')).toHaveCount(0);
    // The only button in the welcome is the key connect button.
    await expect(welcome.getByRole('button')).toHaveCount(1);
    await page.getByTestId('chat-input').fill('רוחב 240, שלושה תאים');
    await page.getByTestId('chat-send').click();
    await expect(welcome).toBeHidden();
    await expect(page.getByTestId('chat-messages')).toContainText('רוחב 240');
  });

  test('the cursor becomes a pointer over a component', async ({ page }) => {
    await openDesigner(page);
    const point = await page.evaluate(() => window.__banai.viewer.screenPointOf('dr_left'));
    await page.mouse.move(point.x, point.y);
    await expect.poll(() => page.locator('#viewer canvas').evaluate((node) => node.style.cursor)).toBe('pointer');
  });
});

test.describe('door configurations render with hardware', () => {
  // uxui hardware: each handle is a child of its door mesh (PR #3 put hardware meshes at the top level).
  const handleCounts = (page, ids) => page.evaluate((list) => list.map((id) => {
    const door = window.__banai.viewer.meshOf(id);
    return door ? door.children.filter((c) => c.userData.part === 'handle').length : -1;
  }), ids);

  test('hinged and sliding doors get a handle each; none has no door hardware', async ({ page }) => {
    await openDesigner(page);
    expect(await handleCounts(page, ['dr_left', 'dr_middle', 'dr_right'])).toEqual([1, 1, 1]);

    await page.evaluate(() => window.__banai.store.dispatch([{ op: 'configure_doors', type: 'sliding', ids: ['dr_a', 'dr_b', 'dr_c'] }]));
    await page.waitForFunction(() => window.__banai.viewer.meshOf('dr_a'));
    expect(await handleCounts(page, ['dr_a', 'dr_b', 'dr_c'])).toEqual([1, 1, 1]);

    await page.evaluate(() => window.__banai.store.dispatch([{ op: 'configure_doors', type: 'none' }]));
    await page.waitForFunction(() => !window.__banai.viewer.meshOf('dr_a'));
    const doorHandles = await page.evaluate(() => {
      let count = 0;
      window.__banai.viewer.meshOf('shf_l1').parent.traverse((o) => {
        if (o.userData.part === 'handle' && o.parent?.userData.kind === 'door') count += 1;
      });
      return count;
    });
    expect(doorHandles).toBe(0);
  });
});

test.describe('save and render dialogs (backend phases not built yet)', () => {
  test('Save opens the projects dialog, which says honestly where projects are kept', async ({ page }) => {
    await openDesigner(page);
    await page.getByTestId('open-save').click();
    const dialog = page.getByTestId('save-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('בדפדפן הזה בלבד');
    await page.getByTestId('save-close').click();
    await expect(dialog).toBeHidden();
  });

  test('Render starts the path tracer HUD over the 3D view; Esc returns to editing without touching the design', async ({ page }) => {
    await openDesigner(page);
    const revision = await page.evaluate(() => window.__banai.store.getState().revision);
    // The HUD flow only: a real path-tracer compile on SwiftShader keeps the browser busy long after the
    // test and breaks the next one. The tracer itself is unit-tested (tests/unit/viewer/pathtrace.test.js).
    await page.evaluate(() => {
      const { viewer } = window.__banai;
      viewer.startRender = ({ onProgress }) => { onProgress(0, 400, true); return Promise.resolve(); };
      viewer.stopRender = () => {};
    });
    await page.getByTestId('open-render').click();
    const hud = page.getByTestId('render-hud');
    await expect(hud).toContainText('מכין את מנוע הרינדור');
    await expect(hud).toBeVisible();
    await expect(page.locator('body')).toHaveClass(/is-rendering/);
    await page.keyboard.press('Escape');
    await expect(hud).toBeHidden();
    await expect(page.locator('body')).not.toHaveClass(/is-rendering/);
    expect(await page.evaluate(() => window.__banai.store.getState().revision)).toBe(revision);
  });
});
