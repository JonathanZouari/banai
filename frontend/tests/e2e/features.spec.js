import { clickComponent, expect, openDesigner, selection, test } from './fixtures.js';

const designState = (page) => page.evaluate(() => window.__banai.store.getState().design);
const uiState = (page) => page.evaluate(() => window.__banai.store.getState().ui);
const doorsOf = async (page) => (await designState(page)).doors.items;
const doorById = async (page, id) => (await doorsOf(page)).find((door) => door.id === id);
const widthMm = async (page) => (await designState(page)).dimensions.width;

/** Child groups of a mesh with the given userData.part, as { part, style } (style only for handles). */
const childrenWithPart = (page, componentId, part) => page.evaluate(({ id, wanted }) => {
  const mesh = window.__banai.viewer.meshOf(id);
  if (!mesh) return null;
  return mesh.children.filter((child) => child.userData.part === wanted).map((child) => ({ part: child.userData.part, style: child.userData.style ?? null }));
}, { id: componentId, wanted: part });

/** Number of children of the scene's `props` group (0 when it is absent). Found by walking up from the carcass mesh. */
const propsCount = (page) => page.evaluate(() => {
  let node = window.__banai.viewer.meshOf('carcass');
  while (node?.parent) node = node.parent;
  const props = node?.getObjectByName('props');
  return props ? props.children.length : 0;
});

const widthLabel = (page) => page.locator('.dim-label', { hasText: /^W \d/ });
const cmText = (mm) => `W ${(mm / 10).toFixed(1)} cm`;

test.describe('New features', () => {
  test.beforeEach(async ({ page }) => openDesigner(page));

  test('doors carry a bar handle by default', async ({ page }) => {
    await expect.poll(() => childrenWithPart(page, 'dr_left', 'handle')).toEqual([{ part: 'handle', style: 'bar' }]);
  });

  test('the quick bar changes the handle style and finish', async ({ page }) => {
    await page.getByTestId('handle-style').selectOption('knob');
    await expect.poll(async () => (await designState(page)).handles.style).toBe('knob');
    await expect.poll(() => childrenWithPart(page, 'dr_left', 'handle')).toEqual([{ part: 'handle', style: 'knob' }]);

    await page.getByTestId('handle-finish').selectOption('brass');
    await expect.poll(async () => (await designState(page)).handles.finish).toBe('brass');
  });

  test('mirror doors: every door gets a mirror and stays selectable', async ({ page }) => {
    await page.getByTestId('toggle-mirror').check();
    await expect.poll(async () => {
      const doors = await doorsOf(page);
      return doors.length > 0 && doors.every((door) => door.mirror === true);
    }).toBe(true);
    await expect.poll(async () => (await childrenWithPart(page, 'dr_left', 'mirror'))?.length).toBe(1);

    await clickComponent(page, 'dr_middle');
    await expect.poll(() => selection(page)).toEqual({ id: 'dr_middle', kind: 'door' });
  });

  test('open doors swing open, and selecting a shelf keeps them open', async ({ page }) => {
    test.setTimeout(90_000);
    await page.getByTestId('toggle-doors-open').check();
    await expect.poll(async () => (await uiState(page)).doorsOpen).toBe(true);
    await expect.poll(() => page.evaluate(() => window.__banai.viewer.doorOpenness), { timeout: 5_000 }).toBeGreaterThanOrEqual(0.99);
    await expect.poll(() => page.evaluate(() => Math.abs(window.__banai.viewer.meshOf('dr_left').rotation.y))).toBeGreaterThan(1e-3);

    await clickComponent(page, 'shf_l2');
    await expect.poll(() => selection(page)).toEqual({ id: 'shf_l2', kind: 'shelf' });
    expect((await uiState(page)).doorsOpen).toBe(true);
    expect(await page.evaluate(() => Boolean(window.__banai.viewer.meshOf('dr_left')))).toBe(true);
  });

  test('clothes are shown by default and removed when switched off', async ({ page }) => {
    await expect(page.getByTestId('toggle-clothes')).toBeChecked();
    await expect.poll(() => propsCount(page)).toBeGreaterThan(0);

    await page.getByTestId('toggle-clothes').uncheck();
    await expect.poll(async () => (await uiState(page)).showClothes).toBe(false);
    await expect.poll(() => propsCount(page)).toBe(0);
  });

  test('the room backdrop loads and the studio can be restored', async ({ page }) => {
    test.setTimeout(90_000); // the room model is large and the software renderer is slow
    await page.getByTestId('backdrop').selectOption('room');
    await expect.poll(() => page.evaluate(() => window.__banai.viewer.backdrop), { timeout: 15_000 }).toBe('room');

    await page.getByTestId('backdrop').selectOption('studio');
    await expect.poll(() => page.evaluate(() => window.__banai.viewer.backdrop), { timeout: 15_000 }).toBe('studio');
  });

  test('a wood swatch textures the carcass with the catalog colour', async ({ page }) => {
    const expectedHex = await page.evaluate(() => window.__banai.store.getState().catalog.colors.find((c) => c.id === 'light_oak').hex);
    await page.getByRole('button', { name: 'Light oak', exact: true }).first().click();

    await expect.poll(() => page.evaluate(() => window.__banai.viewer.meshOf('carcass').material.map !== null)).toBe(true);
    await expect.poll(() => page.evaluate(() => window.__banai.viewer.meshOf('carcass').material.color.getHexString()))
      .toBe(expectedHex.replace('#', '').toLowerCase());
  });

  test.describe('selected door controls', () => {
    test.beforeEach(async ({ page }) => {
      await clickComponent(page, 'dr_left');
      await expect.poll(() => selection(page)).toEqual({ id: 'dr_left', kind: 'door' });
    });

    test('the mirror switch toggles only that door', async ({ page }) => {
      await page.getByTestId('door-mirror').click();
      await expect.poll(async () => (await doorById(page, 'dr_left')).mirror === true).toBe(true);
      expect((await doorById(page, 'dr_middle')).mirror === true).toBe(false);
      await expect.poll(async () => (await childrenWithPart(page, 'dr_left', 'mirror'))?.length).toBe(1);

      await page.getByTestId('door-mirror').click();
      await expect.poll(async () => (await doorById(page, 'dr_left')).mirror === true).toBe(false);
    });

    test('a door handle override applies to that door only and can be reset', async ({ page }) => {
      await page.getByTestId('door-handle-style').selectOption('cup');
      await expect.poll(async () => (await doorById(page, 'dr_left')).handle?.style).toBe('cup');

      // The other doors keep the wardrobe-wide style.
      const design = await designState(page);
      expect(design.handles.style).toBe('bar');
      expect((await doorById(page, 'dr_middle')).handle ?? null).toBeNull();
      await expect.poll(() => childrenWithPart(page, 'dr_left', 'handle')).toEqual([{ part: 'handle', style: 'cup' }]);
      await expect.poll(() => childrenWithPart(page, 'dr_middle', 'handle')).toEqual([{ part: 'handle', style: 'bar' }]);

      await page.getByTestId('door-handle-reset').click();
      await expect.poll(async () => (await doorById(page, 'dr_left')).handle ?? null).toBeNull();
      await expect.poll(() => childrenWithPart(page, 'dr_left', 'handle')).toEqual([{ part: 'handle', style: 'bar' }]);
    });
  });

  test('on-canvas steppers change the width by 10 mm, or 100 mm with Shift, and keep the selection', async ({ page }) => {
    test.setTimeout(90_000);
    await clickComponent(page, 'dr_middle');
    await expect.poll(() => selection(page)).toEqual({ id: 'dr_middle', kind: 'door' });
    const start = await widthMm(page);
    await expect(widthLabel(page)).toHaveText(cmText(start));

    await page.getByTestId('step-width-plus').click();
    await expect.poll(() => widthMm(page)).toBe(start + 10);
    await expect(widthLabel(page)).toHaveText(cmText(start + 10));
    expect(await selection(page)).toEqual({ id: 'dr_middle', kind: 'door' });

    await page.getByTestId('step-width-plus').click({ modifiers: ['Shift'] });
    await expect.poll(() => widthMm(page)).toBe(start + 110);
    await expect(widthLabel(page)).toHaveText(cmText(start + 110));
    expect(await selection(page)).toEqual({ id: 'dr_middle', kind: 'door' });
  });

  test('the width slider sets the width', async ({ page }) => {
    expect(await widthMm(page)).not.toBe(2400);
    await page.getByTestId('dim-width-slider').evaluate((el) => {
      el.value = '2400';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect.poll(() => widthMm(page)).toBe(2400);
    await expect(page.getByTestId('dim-width')).toHaveValue('240.0');
  });
});
