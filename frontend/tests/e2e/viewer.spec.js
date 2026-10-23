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

test.describe('camera angle buttons', () => {
  test.beforeEach(async ({ page }) => openDesigner(page));

  const cameraPose = (page) => page.evaluate(() => {
    const { camera, controls } = window.__banai.viewer;
    return { position: camera.position.toArray(), target: controls.target.toArray() };
  });
  // The pose a preset should end at, from the same module the viewer uses (served by Vite).
  const expectedPose = (page, view) => page.evaluate(async (name) => {
    const { cameraPose: poseFor } = await import('/src/viewer/cameraViews.js');
    const { store, viewer } = window.__banai;
    return poseFor(name, store.getState().design.dimensions, viewer.camera.fov);
  }, view);
  const near = (a, b) => a.every((value, i) => Math.abs(value - b[i]) < 1e-3);
  // Clicks in the page and reads the camera in the same tick, before any frame can render.
  const clickAndRead = (page, view) => page.evaluate((name) => {
    document.querySelector(`#view-presets [data-view="${name}"]`).click();
    return window.__banai.viewer.camera.position.toArray();
  }, view);

  test('shows the four buttons as one labelled group', async ({ page }) => {
    const group = page.getByRole('group', { name: 'זווית מצלמה' });
    for (const label of ['חזית', 'צד', '3/4', 'איפוס']) await expect(group.getByRole('button', { name: label, exact: true })).toBeVisible();
  });

  for (const [label, view] of [['חזית', 'front'], ['צד', 'side'], ['3/4', 'threeQuarter']]) {
    test(`"${label}" flies the camera to the ${view} view`, async ({ page }) => {
      const expected = await expectedPose(page, view);
      await page.getByRole('button', { name: label, exact: true }).click();
      await expect.poll(async () => near((await cameraPose(page)).position, expected.position), { timeout: 3000 }).toBe(true);
      expect(near((await cameraPose(page)).target, expected.target)).toBe(true);
    });
  }

  test('"איפוס" returns to the opening view after the user orbits away', async ({ page }) => {
    const opening = await expectedPose(page, 'reset');
    const box = await page.locator('#viewer canvas').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 220, box.y + box.height / 2 + 30, { steps: 10 });
    await page.mouse.up();
    await page.getByRole('button', { name: 'איפוס', exact: true }).click();
    await expect.poll(async () => near((await cameraPose(page)).position, opening.position), { timeout: 4000 }).toBe(true);
  });

  test('the move is gradual: the camera passes through in-between positions', async ({ page }) => {
    const start = (await cameraPose(page)).position;
    const expected = await expectedPose(page, 'side');
    expect(near(await clickAndRead(page, 'side'), start)).toBe(true); // nothing jumps on click
    const seen = await page.evaluate(() => new Promise((resolve) => {
      const positions = [];
      const sample = () => {
        positions.push(window.__banai.viewer.camera.position.toArray());
        if (positions.length < 40) requestAnimationFrame(sample); else resolve(positions);
      };
      requestAnimationFrame(sample);
    }));
    expect(seen.some((p) => !near(p, start) && !near(p, expected.position))).toBe(true);
  });

  test('with prefers-reduced-motion the camera jumps straight to the view', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const expected = await expectedPose(page, 'front');
    expect(near(await clickAndRead(page, 'front'), expected.position)).toBe(true);
  });

  test('camera moves never change the design state', async ({ page }) => {
    await page.getByTestId('part-shf_l1').click();
    const snapshot = () => page.evaluate(() => {
      const { design, revision, selection, ui } = window.__banai.store.getState();
      return JSON.stringify({ design, revision, selection, ui });
    });
    const before = await snapshot();
    for (const label of ['חזית', 'צד', '3/4', 'איפוס']) await page.getByRole('button', { name: label, exact: true }).click();
    await page.waitForTimeout(800);
    expect(await snapshot()).toBe(before);
  });
});
