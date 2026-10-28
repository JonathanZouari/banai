import { clickComponent, expect, openDesigner, paintedRatio, selection, test } from './fixtures.js';

test.describe('Phase 3: 3D viewer', () => {
  test.beforeEach(async ({ page }) => openDesigner(page));

  test('renders the basic wardrobe with overall dimension labels', async ({ page }) => {
    await expect.poll(() => paintedRatio(page)).toBeGreaterThan(0.05);
    await expect(page.getByText('W 200.0 cm', { exact: true })).toBeVisible();
    await expect(page.getByText('H 240.0 cm', { exact: true })).toBeVisible();
    await expect(page.getByText('D 60.0 cm', { exact: true })).toBeVisible();
  });

  test('orbit drag rotates the camera', async ({ page }) => {
    const before = await page.evaluate(() => window.__banai.viewer.camera.position.toArray());
    const box = await page.locator('#viewer canvas').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 200, box.y + box.height / 2 + 40, { steps: 10 });
    await page.mouse.up();
    const after = await page.evaluate(() => window.__banai.viewer.camera.position.toArray());
    expect(after).not.toEqual(before);
  });

  test('doors are shown by default and "Show interior" hides them', async ({ page }) => {
    expect(await page.evaluate(() => Boolean(window.__banai.viewer.meshOf('dr_left')))).toBe(true);
    await page.getByLabel('Show interior').check();
    await expect.poll(() => page.evaluate(() => Boolean(window.__banai.viewer.meshOf('dr_left')))).toBe(false);
  });

  test('clicking a shelf selects it, highlights it and shows its dimensions', async ({ page }) => {
    await page.getByLabel('Show interior').check();
    await clickComponent(page, 'shf_l2');
    expect(await selection(page)).toEqual({ id: 'shf_l2', kind: 'shelf' });
    await expect(page.getByTestId('selected-section')).toContainText('Selected · Shelf');
    await expect(page.locator('.dim-label--selected')).toHaveText('Shelf · 80.0 cm from base · 1.8 cm thick');
  });

  test('clicking a door selects the door; clicking empty space clears the selection', async ({ page }) => {
    await clickComponent(page, 'dr_middle');
    expect(await selection(page)).toEqual({ id: 'dr_middle', kind: 'door' });
    const box = await page.locator('#viewer canvas').boundingBox();
    await page.mouse.click(box.x + 10, box.y + 10);
    expect(await selection(page)).toBeNull();
  });

  test('the view updates automatically when the committed state changes', async ({ page }) => {
    const y0 = await page.evaluate(() => window.__banai.viewer.meshOf('shf_l1').position.y);
    const result = await page.evaluate(() => window.__banai.store.dispatch([{ op: 'modify_shelf', id: 'shf_l1', y: 1000 }]));
    expect(result.ok).toBe(true);
    await expect.poll(() => page.evaluate(() => window.__banai.viewer.meshOf('shf_l1').position.y)).toBeGreaterThan(y0 + 0.5);
  });

  test('picking works in the same tick as a scene rebuild (before any frame is rendered)', async ({ page }) => {
    const selected = await page.evaluate(() => {
      const { store, viewer } = window.__banai;
      store.setDoorsVisible(false); // rebuilds the scene; its meshes have not been rendered yet
      // Synthetic events have no real pointer to capture (OrbitControls would throw).
      viewer.canvas.setPointerCapture = () => {};
      viewer.canvas.releasePointerCapture = () => {};
      const { x, y } = viewer.screenPointOf('shf_r1');
      const fire = (type) => viewer.canvas.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, bubbles: true, buttons: type === 'pointerdown' ? 1 : 0 }));
      fire('pointerdown');
      fire('pointerup');
      return store.getState().selection?.id ?? null;
    });
    expect(selected).toBe('shf_r1');
  });
});

// The camera's orbit centre, rounded to a millimetre.
const target = (page) => page.evaluate(() => window.__banai.viewer.controls.target.toArray().map((v) => Math.round(v * 1000)));
const centreOf = (page, id) => page.evaluate((componentId) => window.__banai.viewer.meshOf(componentId).position.toArray().map((v) => Math.round(v * 1000)), id);

test.describe('camera focus on the selected part', () => {
  test.beforeEach(async ({ page }) => openDesigner(page));

  test('a selection eases the orbit centre to the part; a double click on the background returns to the overview', async ({ page }) => {
    await page.evaluate(() => window.__banai.store.setDoorsVisible(false)); // the doors would take the click
    const overview = await target(page);
    await clickComponent(page, 'shf_r1');
    await expect.poll(() => target(page)).toEqual(await centreOf(page, 'shf_r1'));
    await page.evaluate(() => window.__banai.store.select('shf_l1')); // the panel selects through the store too
    await expect.poll(() => target(page)).toEqual(await centreOf(page, 'shf_l1'));
    const box = await page.locator('#viewer canvas').boundingBox();
    await page.mouse.dblclick(box.x + 8, box.y + 8);
    await expect.poll(() => target(page)).toEqual(overview);
    // The camera is the viewer's alone: nothing about it is in the design state.
    expect(await page.evaluate(() => JSON.stringify(window.__banai.store.getState().ui))).not.toMatch(/camera|target/);
  });

  test('a click or a double click on the part during the move does not stop it or reset the view', async ({ page }) => {
    await page.evaluate(() => window.__banai.store.setDoorsVisible(false));
    const centre = await centreOf(page, 'shf_r1');
    await clickComponent(page, 'shf_r1');
    const point = await page.evaluate(() => window.__banai.viewer.screenPointOf('shf_r1'));
    await page.mouse.click(point.x, point.y); // the same part again, mid-move: a press is not an orbit
    await expect.poll(() => target(page)).toEqual(centre);
    await page.evaluate(() => window.__banai.store.select(null));
    await clickComponent(page, 'shf_l1');
    const other = await page.evaluate(() => window.__banai.viewer.screenPointOf('shf_l1'));
    await page.mouse.dblclick(other.x, other.y); // not the background, even as the part slides away
    await expect.poll(() => target(page)).toEqual(await centreOf(page, 'shf_l1'));
  });

  test('with reduced motion the camera jumps at once', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const jumped = await page.evaluate(() => {
      const { store, viewer } = window.__banai;
      store.select('shf_r1');
      return viewer.controls.target.toArray().map((v) => Math.round(v * 1000)); // in the same tick, before any frame
    });
    expect(jumped).toEqual(await centreOf(page, 'shf_r1'));
  });
});
