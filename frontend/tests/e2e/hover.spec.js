import { expect, hoverComponent, openDesigner, test } from './fixtures.js';

const label = (page) => page.getByTestId('hover-label');
const showInterior = (page) => page.evaluate(() => window.__banai.store.setDoorsVisible(false));

test.describe('hover label in the 3D view', () => {
  test.beforeEach(async ({ page }) => openDesigner(page));

  test('a shelf shows a small label next to the pointer, never on top of it', async ({ page }) => {
    await showInterior(page);
    const point = await hoverComponent(page, 'shf_l1');
    await expect(label(page)).toBeVisible();
    await expect(label(page)).toHaveText(/^Shelf · [\d.]+ cm from base/);
    const box = await label(page).boundingBox();
    const coversPointer = point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height;
    expect(coversPointer).toBe(false);
  });

  test('drawers and compartments get a label too', async ({ page }) => {
    await showInterior(page);
    await hoverComponent(page, 'drw_r1');
    await expect(label(page)).toHaveText(/^Drawer · /);
    // A compartment is hovered through its back panel: aim at the back panel's centre, inside compartment 2.
    const back = await page.evaluate(() => {
      const { viewer } = window.__banai;
      const panel = viewer.meshOf('shf_l1').parent.children.find((mesh) => mesh.userData.part === 'back');
      const projected = panel.position.clone().project(viewer.camera);
      const rect = viewer.canvas.getBoundingClientRect();
      return { x: rect.left + ((projected.x + 1) / 2) * rect.width, y: rect.top + ((1 - projected.y) / 2) * rect.height };
    });
    await page.mouse.move(back.x, back.y);
    await expect(label(page)).toHaveText(/^Compartment 2 · width /);
  });

  test('the label disappears when the pointer leaves the canvas', async ({ page }) => {
    await showInterior(page);
    await hoverComponent(page, 'shf_l1');
    await expect(label(page)).toBeVisible();
    const canvas = await page.locator('#viewer canvas').boundingBox();
    await page.mouse.move(canvas.x + canvas.width / 2, canvas.y - 20);
    await expect(label(page)).toBeHidden();
  });

  test('a door shows no label, and pressing to rotate hides it', async ({ page }) => {
    await hoverComponent(page, 'dr_left');
    await expect(label(page)).toBeHidden();

    await showInterior(page);
    await hoverComponent(page, 'shf_l1');
    await expect(label(page)).toBeVisible();
    await page.mouse.down();
    await expect(label(page)).toBeHidden();
    await page.mouse.up();
  });
});
