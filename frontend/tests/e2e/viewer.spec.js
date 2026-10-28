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

  test('doors are closed by default; the "Open doors" switch swings them open and back', async ({ page }) => {
    const doorAngle = () => page.evaluate(() => window.__banai.viewer.meshOf('dr_left').rotation.y);
    expect(await doorAngle()).toBeCloseTo(0);
    await page.getByLabel('Open doors').check();
    await expect.poll(() => page.evaluate(() => window.__banai.viewer.doorsOpenAmount())).toBe(1);
    expect(await doorAngle()).toBeCloseTo(-(100 * Math.PI) / 180); // still there, swung open
    await page.getByLabel('Open doors').uncheck();
    await expect.poll(() => page.evaluate(() => window.__banai.viewer.doorsOpenAmount())).toBe(0);
    expect(await doorAngle()).toBeCloseTo(0);
  });

  test('clicking a shelf selects it, highlights it and shows its dimensions', async ({ page }) => {
    await page.getByLabel('Open doors').check();
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
