import { clickComponent, expect, openDesigner, selection, test } from './fixtures.js';

const SECTIONS_STORAGE_KEY = 'banai.ui.sections';

const canvas = (page) => page.locator('#viewer canvas');
const designState = (page) => page.evaluate(() => window.__banai.store.getState().design);
const viewName = (page) => page.evaluate(() => window.__banai.viewer.viewName);
const cursor = (page) => page.evaluate(() => window.__banai.viewer.canvas.style.cursor);
const cameraPose = (page) => page.evaluate(() => {
  const { camera, controls } = window.__banai.viewer;
  return { position: camera.position.toArray(), target: controls.target.toArray() };
});
const maxDelta = (a, b) => Math.max(...a.map((value, i) => Math.abs(value - b[i])));

/**
 * Resolves once the camera has stopped moving: the view animation is over and the orbit
 * damping has coasted to a halt. Counted in rendered frames (not milliseconds), so a slow
 * software renderer cannot make a moving camera look still.
 */
const settledCamera = (page) => page.evaluate(async () => {
  const { camera, controls } = window.__banai.viewer;
  const pose = () => [...camera.position.toArray(), ...controls.target.toArray()];
  let last = pose();
  let still = 0;
  while (still < 5) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const now = pose();
    still = now.every((value, i) => Math.abs(value - last[i]) < 1e-4) ? still + 1 : 0;
    last = now;
  }
});

/** Lets the page process pending pointer events and animation frames. */
const nextFrames = (page, count = 3) => page.evaluate(async (n) => {
  for (let i = 0; i < n; i += 1) await new Promise((resolve) => requestAnimationFrame(resolve));
}, count);

/** Normalised-device coordinates [x, y, z] of the 8 corners of the wardrobe box (x right, y up, z towards -depth). */
const wardrobeCornersNdc = (page) => page.evaluate(() => {
  const { store, viewer } = window.__banai;
  const { width, height, depth } = store.getState().design.dimensions;
  const { camera } = viewer;
  const Vector3 = camera.position.constructor;
  const corners = [];
  [0, width / 1000].forEach((x) => [0, height / 1000].forEach((y) => [0, -depth / 1000].forEach((z) => {
    const ndc = new Vector3(x, y, z).project(camera);
    corners.push([ndc.x, ndc.y, ndc.z]);
  })));
  return corners;
});

async function orbitDrag(page) {
  const box = await canvas(page).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 200, box.y + box.height / 2 + 40, { steps: 10 });
  await page.mouse.up();
}

test.describe('UX pass', () => {
  test.beforeEach(async ({ page }) => openDesigner(page));

  test('view buttons return to 3/4, square up to the front and re-fit in place', async ({ page }) => {
    test.setTimeout(90_000); // the orbit damping has to coast to a halt, which takes many frames on a software renderer
    const threeQuarter = page.getByTestId('view-threeQuarter');
    const front = page.getByTestId('view-front');
    await settledCamera(page);
    const loaded = await cameraPose(page);
    expect(await viewName(page)).toBe('threeQuarter');
    await expect(threeQuarter).toHaveAttribute('aria-pressed', 'true');

    await orbitDrag(page);
    await expect.poll(() => viewName(page)).toBeNull();
    await expect(threeQuarter).toHaveAttribute('aria-pressed', 'false');
    await settledCamera(page);
    expect(maxDelta((await cameraPose(page)).position, loaded.position)).toBeGreaterThan(0.1);

    await threeQuarter.click();
    await expect.poll(() => viewName(page)).toBe('threeQuarter');
    await expect(threeQuarter).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(async () => maxDelta((await cameraPose(page)).position, loaded.position)).toBeLessThan(1e-2);
    await expect.poll(async () => maxDelta((await cameraPose(page)).target, loaded.target)).toBeLessThan(1e-2);

    await front.click();
    await expect(front).toHaveAttribute('aria-pressed', 'true');
    await expect(threeQuarter).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => viewName(page)).toBe('front');
    await expect.poll(() => page.evaluate(() => {
      const { camera, controls } = window.__banai.viewer;
      return Math.abs(camera.position.x - controls.target.x);
    })).toBeLessThan(1e-3);

    // Fit re-frames along the same direction and does not change the named view.
    await settledCamera(page);
    const framed = await cameraPose(page);
    await page.evaluate(() => {
      const { camera, controls } = window.__banai.viewer;
      camera.position.lerp(controls.target, 0.5); // move in without firing a controls event
      controls.update();
    });
    expect(maxDelta((await cameraPose(page)).position, framed.position)).toBeGreaterThan(0.5);
    await page.getByTestId('view-fit').click();
    await expect.poll(async () => maxDelta((await cameraPose(page)).position, framed.position)).toBeLessThan(1e-3);
    expect(maxDelta((await cameraPose(page)).target, framed.target)).toBeLessThan(1e-3);
    expect(await viewName(page)).toBe('front');
    await expect(front).toHaveAttribute('aria-pressed', 'true');
  });

  // KNOWN APP BUG (reported, not fixed here): setView() moves the camera but leaves the
  // OrbitControls damping momentum from the drag in place, so the camera keeps coasting after the
  // animation and ends far from the requested pose. test.fail() keeps this documented without
  // breaking the run; when viewer.js discards the momentum this test passes and must be un-failed.
  test('a view button pressed straight after an orbit drag still lands exactly on the 3/4 pose', async ({ page }) => {
    test.fail(true, 'viewer.js: applyPose() keeps applying OrbitControls damping momentum after a view change');
    test.setTimeout(90_000);
    await settledCamera(page);
    const loaded = await cameraPose(page);
    await orbitDrag(page);
    await page.getByTestId('view-threeQuarter').click();
    await expect.poll(() => viewName(page)).toBe('threeQuarter');
    await settledCamera(page);
    expect(maxDelta((await cameraPose(page)).position, loaded.position)).toBeLessThan(1e-2);
  });

  test.describe('at a narrow viewport', () => {
    test.use({ viewport: { width: 1100, height: 700 } });

    test('the whole wardrobe is framed inside the view', async ({ page }) => {
      await settledCamera(page);
      const extent = async () => Math.max(...(await wardrobeCornersNdc(page)).flat().map(Math.abs));
      expect(await wardrobeCornersNdc(page)).toHaveLength(8);
      await expect.poll(extent).toBeLessThanOrEqual(1);
      // Framed, not merely tiny: the box fills a good share of the view.
      expect(await extent()).toBeGreaterThan(0.3);
    });

    test('the AI column starts collapsed', async ({ page }) => {
      await expect(page.locator('.workspace')).toHaveClass(/workspace--chat-collapsed/);
      await expect(page.locator('#chat-toggle')).toHaveAttribute('aria-expanded', 'false');
    });
  });

  test('the AI column is open on a wide screen and the toggle gives the 3D view more room', async ({ page }) => {
    const workspace = page.locator('.workspace');
    const toggle = page.locator('#chat-toggle');
    await expect(workspace).not.toHaveClass(/workspace--chat-collapsed/);
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const before = (await canvas(page).boundingBox()).width;

    await toggle.click();
    await expect(workspace).toHaveClass(/workspace--chat-collapsed/);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect.poll(async () => (await canvas(page).boundingBox()).width).toBeGreaterThan(before);
  });

  test('hovering a part shows a pointer cursor; empty space does not', async ({ page }) => {
    await settledCamera(page);
    const point = await page.evaluate(() => window.__banai.viewer.screenPointOf('dr_middle'));
    await page.mouse.move(point.x, point.y);
    await expect.poll(() => cursor(page)).toBe('pointer');

    const box = await canvas(page).boundingBox();
    await page.mouse.move(box.x + 10, box.y + 10);
    await expect.poll(() => cursor(page)).toBe('');
  });

  test('right-clicking a part does not select it', async ({ page }) => {
    await settledCamera(page);
    const point = await page.evaluate(() => window.__banai.viewer.screenPointOf('dr_middle'));
    await page.mouse.click(point.x, point.y, { button: 'right' });
    await nextFrames(page);
    expect(await selection(page)).toBeNull();

    // The same point does select with the primary button, so the check above is not vacuous.
    await page.mouse.click(point.x, point.y);
    await expect.poll(() => selection(page)).toEqual({ id: 'dr_middle', kind: 'door' });
  });

  test('Esc clears the selection', async ({ page }) => {
    await clickComponent(page, 'dr_middle');
    await expect.poll(() => selection(page)).toEqual({ id: 'dr_middle', kind: 'door' });
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press('Escape');
    await expect.poll(() => selection(page)).toBeNull();
  });

  test('keyboard focus survives an edit: Tab after changing the width lands on the height field', async ({ page }) => {
    const width = page.getByTestId('dim-width');
    await width.focus();
    await width.fill('210');
    await page.keyboard.press('Tab');

    await expect.poll(() => page.evaluate(() => document.activeElement?.dataset?.testid)).toBe('dim-height');
    await expect.poll(async () => (await designState(page)).dimensions.width).toBe(2100);
    // The panel was re-rendered with the new value, and focus is on the new height input.
    await expect(page.getByTestId('dim-width')).toHaveValue('210.0');
    await expect(page.getByTestId('dim-height')).toBeFocused();
  });

  test('a collapsed section stays collapsed after a reload', async ({ page }) => {
    const summaryOf = (title) => page.locator('#properties-content summary').filter({ hasText: title });
    const materialsSummary = summaryOf('Materials');
    const materials = materialsSummary.locator('xpath=..'); // the section's <details>
    const wardrobe = summaryOf('Wardrobe').locator('xpath=..');
    await expect(materials).toHaveAttribute('open', '');
    await expect(wardrobe).toHaveAttribute('open', '');

    await materialsSummary.click();
    await expect(materials).not.toHaveAttribute('open');
    await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), SECTIONS_STORAGE_KEY)).toContain('"materials":false');

    await page.reload();
    await page.waitForFunction(() => window.__banai?.viewer.meshOf('shf_l1'));
    await expect(materials).toBeVisible();
    await expect(materials).not.toHaveAttribute('open');
    await expect(wardrobe).toHaveAttribute('open', '');
  });

  test('a selected shelf says where it is and marks its compartment in the list', async ({ page }) => {
    await page.getByLabel('Show interior').check();
    await clickComponent(page, 'shf_l2');
    const selected = page.getByTestId('selected-section');
    await expect(selected).toContainText('Selected · Shelf');
    await expect(selected).toContainText('Compartment 1 · Shelf 2 of 4');

    const leftRow = page.getByTestId('select-cmp_left').locator('xpath=ancestor::li');
    await expect(leftRow).toHaveAttribute('aria-current', 'true');
    await expect(page.locator('#properties-content [aria-current]')).toHaveCount(1);

    await selected.getByRole('button', { name: 'Deselect' }).click();
    await expect.poll(() => selection(page)).toBeNull();
    await expect(page.locator('#properties-content [aria-current]')).toHaveCount(0);
  });

  test('the loading placeholder is gone once the designer is ready', async ({ page }) => {
    await expect(page.locator('.viewer-loading')).toHaveCount(0);
  });
});
