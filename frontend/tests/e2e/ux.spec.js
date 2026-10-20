import { test, expect, openDesigner, openRender } from './fixtures.js';

test.describe('start screen', () => {
  test('is shown first with three entry points and the manufacturing disclaimer', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('start-screen')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Design your wardrobe' })).toBeVisible();
    for (const id of ['guided', 'freeText', 'basic']) await expect(page.getByTestId(`entry-${id}`)).toBeVisible();
    await expect(page.getByText('not manufacturing drawings')).toBeVisible();
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
    await expect(page.getByText('W 200.0 cm', { exact: true })).toBeVisible();
  });

  test('"Describe it" opens the same editor and focuses the chat composer', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('entry-freeText').click();
    await expect(page.getByTestId('chat-input')).toBeFocused();
    await expect(page.getByTestId('chat-input')).toHaveAttribute('placeholder', /240 cm wide/);
    await page.waitForFunction(() => window.__banai?.viewer.meshOf('shf_l1'));
  });
});

test.describe('AI chat panel (agent not connected yet)', () => {
  test('sending a message gets an honest reply and never changes the design', async ({ page }) => {
    await openDesigner(page);
    const before = await page.evaluate(() => window.__banai.store.getState().revision);
    await page.getByTestId('chat-input').fill('make it 3 m wide');
    await page.getByTestId('chat-send').click();
    const messages = page.getByTestId('chat-messages');
    await expect(messages).toContainText('make it 3 m wide');
    await expect(messages).toContainText("isn't connected yet");
    expect(await page.evaluate(() => window.__banai.store.getState().revision)).toBe(before);
  });

  test('a proposal shows Confirm/Cancel, goes stale after a manual edit, and Cancel changes nothing', async ({ page }) => {
    await openDesigner(page);
    await page.evaluate(() => {
      const { chat, store } = window.__banai;
      chat.setProposal({
        id: 'demo', baseRevision: store.getState().revision, summary: 'Widen the wardrobe',
        changes: [{ title: 'Width', detail: '200.0 cm to 240.0 cm' }],
      });
    });
    const card = page.getByTestId('proposal-card');
    await expect(card).toContainText('Proposed changes');
    await expect(page.getByTestId('proposal-confirm')).toBeEnabled();

    await page.getByTestId('dim-width').fill('210');
    await page.getByTestId('dim-width').press('Enter');
    await expect(card).toContainText('Design changed. Ask the agent to re-propose.');
    await expect(page.getByTestId('proposal-confirm')).toBeDisabled();

    const revision = await page.evaluate(() => window.__banai.store.getState().revision);
    await page.getByTestId('proposal-cancel').click();
    await expect(card).toHaveCount(0);
    await expect(page.getByTestId('chat-messages')).toContainText('No changes were made');
    expect(await page.evaluate(() => window.__banai.store.getState().revision)).toBe(revision);
  });
});

test.describe('look and feel', () => {
  test('shows the BanAI logo in the top bar and on the start screen', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('start-screen').getByRole('img', { name: 'BanAI' })).toBeVisible();
    await page.getByTestId('entry-basic').click();
    await expect(page.locator('.topbar').getByRole('img', { name: 'BanAI' })).toBeVisible();
    await expect(page.locator('.topbar .logo__word')).toHaveText('BanAI');
  });

  test('uses the display and body fonts', async ({ page }) => {
    await openDesigner(page);
    const fonts = await page.evaluate(async () => {
      await document.fonts.ready;
      return {
        logo: getComputedStyle(document.querySelector('.logo__word')).fontFamily,
        body: getComputedStyle(document.body).fontFamily,
        loaded: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replaceAll('"', '')),
      };
    });
    expect(fonts.logo).toContain('Bricolage Grotesque');
    expect(fonts.body).toContain('DM Sans');
    expect(fonts.loaded).toEqual(expect.arrayContaining(['Bricolage Grotesque', 'DM Sans']));
  });

  test('dropdowns keep their text clear of the chevron', async ({ page }) => {
    await openDesigner(page);
    await page.evaluate(() => window.__banai.store.select('shf_l1'));
    const select = page.locator('select.field__input').first();
    await expect(select).toBeVisible();
    const padding = await select.evaluate((node) => parseFloat(getComputedStyle(node).paddingRight));
    expect(padding).toBeGreaterThanOrEqual(40);
  });

  test('a starter prompt fills the composer but sends nothing', async ({ page }) => {
    await openDesigner(page);
    await expect(page.getByTestId('chat-welcome')).toBeVisible();
    await page.getByTestId('suggestion').first().click();
    await expect(page.getByTestId('chat-input')).toHaveValue(/240 cm wide/);
    await expect(page.getByTestId('chat-messages')).toBeHidden();
    await page.getByTestId('chat-send').click();
    await expect(page.getByTestId('chat-welcome')).toBeHidden();
    await expect(page.getByTestId('chat-messages')).toContainText('240 cm wide');
  });

  test('the cursor becomes a pointer over a component and a press shows a ripple that cleans up', async ({ page }) => {
    await openDesigner(page);
    const point = await page.evaluate(() => window.__banai.viewer.screenPointOf('dr_left'));
    await page.mouse.move(point.x, point.y);
    await expect.poll(() => page.locator('#viewer canvas').evaluate((node) => node.style.cursor)).toBe('pointer');
    const save = page.getByTestId('open-save');
    const box = await save.boundingBox();
    await page.mouse.move(box.x + 10, box.y + 10);
    await page.mouse.down();
    await expect(save.locator('.ripple')).toHaveCount(1);
    await page.mouse.up();
    await page.getByTestId('save-close').click();
    await expect(save.locator('.ripple')).toHaveCount(0);
  });
});

test.describe('door configurations render with hardware', () => {
  const sceneStats = (page) => page.evaluate(() => {
    const scene = window.__banai.viewer.meshOf('dr_left')?.parent ?? null;
    const kinds = {};
    (scene?.children ?? []).forEach((child) => {
      const key = `${child.userData.kind}${child.userData.part ? `:${child.userData.part}` : ''}`;
      kinds[key] = (kinds[key] ?? 0) + 1;
    });
    return kinds;
  });

  test('hinged doors get a handle each; sliding doors get handles plus two rails; none has no hardware', async ({ page }) => {
    await openDesigner(page);
    expect(await sceneStats(page)).toMatchObject({ door: 3, 'hardware:handle': 3 });

    await page.evaluate(() => window.__banai.store.dispatch([{ op: 'configure_doors', type: 'sliding', ids: ['dr_a', 'dr_b', 'dr_c'] }]));
    await page.waitForFunction(() => window.__banai.viewer.meshOf('dr_a'));
    const sliding = await page.evaluate(() => {
      const scene = window.__banai.viewer.meshOf('dr_a').parent;
      return scene.children.filter((c) => c.userData.kind === 'hardware').map((c) => c.userData.part).sort();
    });
    expect(sliding).toEqual(['edge', 'edge', 'edge', 'handle', 'handle', 'handle', 'rail-bottom', 'rail-top']);

    await page.evaluate(() => window.__banai.store.dispatch([{ op: 'configure_doors', type: 'none' }]));
    await page.waitForFunction(() => !window.__banai.viewer.meshOf('dr_a'));
    const remaining = await page.evaluate(() => window.__banai.viewer.meshOf('shf_l1').parent.children.filter((c) => c.userData.kind === 'hardware').length);
    expect(remaining).toBe(0);
  });
});

test.describe('save and render dialogs (backend phases not built yet)', () => {
  test('Save opens a dialog that is honest about being unavailable, with no fake link', async ({ page }) => {
    await openDesigner(page);
    await page.getByTestId('open-save').click();
    const dialog = page.getByTestId('save-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Saving is not available yet');
    await expect(page.getByTestId('share-link')).toHaveValue('');
    await expect(page.getByTestId('save-confirm')).toBeDisabled();
    await page.getByTestId('save-close').click();
    await expect(dialog).toBeHidden();
  });

  test('Render opens a dialog labelled as illustrative, with generation disabled', async ({ page }) => {
    await openDesigner(page);
    await openRender(page);
    const dialog = page.getByTestId('render-dialog');
    await expect(dialog).toContainText('Illustrative image, not the accurate 3D model');
    await expect(page.getByTestId('render-generate')).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });
});

test.describe('lean header and 3D view toolbar', () => {
  test('the header shows only history icons, Save and two menus', async ({ page }) => {
    await openDesigner(page);
    const actions = page.locator('.topbar__actions');
    await expect(actions.getByTestId('undo')).toBeVisible();
    await expect(actions.getByTestId('redo')).toBeVisible();
    await expect(actions.getByTestId('open-save')).toBeVisible();
    await expect(page.getByTestId('open-render')).toBeHidden(); // inside the overflow menu
    await expect(page.getByTestId('lang-switch')).toBeHidden(); // inside the settings menu
    await expect(page.getByTestId('unit-switch')).toBeHidden();
  });

  test('the overflow menu opens, moves focus to its first item, and closes on Escape or a click outside', async ({ page }) => {
    await openDesigner(page);
    const trigger = page.getByTestId('more-menu');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('more-panel')).toHaveAttribute('role', 'menu');
    await expect(page.getByTestId('open-render')).toBeFocused();
    await expect(page.getByTestId('menu-copy-link')).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('more-panel')).toBeHidden();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await page.mouse.click(700, 500); // the 3D view
    await expect(page.getByTestId('more-panel')).toBeHidden();
  });

  test('the settings menu holds language and units, and stays open while choosing', async ({ page }) => {
    await openDesigner(page);
    await page.getByTestId('settings-menu').click();
    await page.getByTestId('unit-in').click();
    await expect(page.getByTestId('settings-panel')).toBeVisible();
    await expect(page.getByTestId('unit-in')).toHaveAttribute('aria-checked', 'true');
    await page.getByTestId('lang-he').click();
    await expect(page.getByTestId('settings-panel')).toBeVisible();
    await expect(page.locator('.topbar')).toHaveAttribute('dir', 'ltr');
    await expect(page.getByTestId('settings-panel')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByTestId('unit-in')).toHaveAttribute('title', 'אינצ׳ים');
  });

  test('redo restores an undone change, from the button and the keyboard', async ({ page }) => {
    await openDesigner(page);
    const width = () => page.evaluate(() => window.__banai.store.getState().design.dimensions.width);
    await expect(page.getByTestId('redo')).toBeDisabled();
    await page.evaluate(() => window.__banai.store.dispatch([{ op: 'update_dimensions', width: 2400 }, { op: 'modify_compartment', compartmentId: 'cmp_right', width: 1032 }]));
    await page.getByTestId('undo').click();
    expect(await width()).toBe(2000);
    await page.getByTestId('redo').click();
    expect(await width()).toBe(2400);
    await page.locator('#viewer canvas').click({ position: { x: 5, y: 5 } }); // focus outside any input
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(width).toBe(2000);
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect.poll(width).toBe(2400);
    await expect(page.getByTestId('redo')).toBeDisabled();
  });

  test('Ctrl+Z inside a field edits the text, not the design', async ({ page }) => {
    await openDesigner(page);
    await page.evaluate(() => window.__banai.store.dispatch([{ op: 'modify_shelf', id: 'shf_l1', y: 450 }]));
    await page.getByTestId('dim-width').click();
    await page.keyboard.press('ControlOrMeta+z');
    expect(await page.evaluate(() => window.__banai.store.getState().design.compartments[0].shelves[0].y)).toBe(450);
  });

  test('the toolbar switches between doors and interior and orbits the camera', async ({ page }) => {
    await openDesigner(page);
    await expect(page.getByTestId('view-doors')).toHaveAttribute('aria-checked', 'true');
    await page.getByTestId('view-interior').click();
    await expect(page.getByTestId('view-interior')).toHaveAttribute('aria-checked', 'true');
    await expect.poll(() => page.evaluate(() => Boolean(window.__banai.viewer.meshOf('dr_left')))).toBe(false);
    await page.getByTestId('view-doors').click();
    await expect.poll(() => page.evaluate(() => Boolean(window.__banai.viewer.meshOf('dr_left')))).toBe(true);
    const camera = () => page.evaluate(() => window.__banai.viewer.camera.position.toArray().map((v) => v.toFixed(3)).join());
    const start = await camera();
    const box = await page.locator('#viewer canvas').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 200, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect.poll(camera).not.toBe(start);
    await expect(page.getByTestId('reset-view')).toHaveCount(0);
  });
});

test('the page itself never scrolls, even with a long properties panel', async ({ page }) => {
  await openDesigner(page);
  await page.getByTestId('view-interior').click();
  await page.locator('#properties-panel').evaluate((panel) => { panel.scrollTop = panel.scrollHeight; });
  const size = await page.evaluate(() => ({ scroll: document.scrollingElement.scrollHeight, view: window.innerHeight }));
  expect(size.scroll).toBeLessThanOrEqual(size.view);
});
