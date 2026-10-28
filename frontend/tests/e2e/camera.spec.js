import { expect, openDesigner, test } from './fixtures.js';

const camera = (page) => page.evaluate(() => {
  const { camera: cam, controls } = window.__banai.viewer;
  return { position: cam.position.toArray(), target: controls.target.toArray(), moving: window.__banai.viewer.isCameraMoving() };
});
const committed = (page) => page.evaluate(() => {
  const { design, revision } = window.__banai.store.getState();
  return JSON.stringify({ design, revision });
});

test.describe('camera angle buttons', () => {
  test.beforeEach(async ({ page }) => openDesigner(page));

  test('front, side, 3/4 and reset move the camera smoothly without changing the design', async ({ page }) => {
    const before = await committed(page);
    const opening = await camera(page);
    const toolbar = page.getByRole('toolbar', { name: 'זווית מצלמה' });
    await expect(toolbar.getByRole('button')).toHaveText(['חזית', 'צד', '3/4', 'איפוס']);

    // A transition, not a jump: in the same tick as the click the camera has not moved yet, and a
    // move is under way. (Checked inside the page, so a slow test machine cannot miss the window.)
    const onClick = await page.evaluate(() => {
      const { camera: cam, isCameraMoving } = window.__banai.viewer;
      const start = cam.position.clone();
      document.querySelector('[data-testid="view-front"]').click();
      return { stayed: cam.position.equals(start), moving: isCameraMoving() };
    });
    expect(onClick).toEqual({ stayed: true, moving: true });
    await expect.poll(async () => (await camera(page)).moving).toBe(false);
    const front = await camera(page);
    expect(front.position[0]).toBeCloseTo(front.target[0], 3); // straight on
    await expect(toolbar.getByRole('button', { name: 'חזית' })).toHaveAttribute('aria-pressed', 'true');

    await toolbar.getByRole('button', { name: 'צד' }).click();
    await expect.poll(async () => (await camera(page)).moving).toBe(false);
    const side = await camera(page);
    expect(side.position[2]).toBeCloseTo(side.target[2], 3);
    await expect(toolbar.getByRole('button', { name: 'חזית' })).toHaveAttribute('aria-pressed', 'false');
    await expect(toolbar.getByRole('button', { name: 'צד' })).toHaveAttribute('aria-pressed', 'true');

    await toolbar.getByRole('button', { name: '3/4' }).click();
    await expect.poll(async () => (await camera(page)).moving).toBe(false);

    await toolbar.getByRole('button', { name: 'איפוס' }).click();
    await expect.poll(async () => (await camera(page)).moving).toBe(false);
    const reset = await camera(page);
    reset.position.forEach((value, i) => expect(value).toBeCloseTo(opening.position[i], 3));
    await expect(toolbar.getByRole('button', { name: '3/4' })).toHaveAttribute('aria-pressed', 'false');

    expect(await committed(page)).toBe(before); // the camera never touches the design state
  });

  test('the buttons work from the keyboard', async ({ page }) => {
    await page.getByRole('button', { name: 'צד' }).focus();
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await camera(page)).moving).toBe(false);
    const side = await camera(page);
    expect(side.position[2]).toBeCloseTo(side.target[2], 3);
  });

  test('orbiting by hand stops a transition and clears the chosen angle', async ({ page }) => {
    await page.getByRole('button', { name: 'חזית' }).click();
    const box = await page.locator('#viewer canvas').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 4 });
    await page.mouse.up();
    expect((await camera(page)).moving).toBe(false);
    await expect(page.getByRole('button', { name: 'חזית' })).toHaveAttribute('aria-pressed', 'false');
  });
});

test.describe('camera angle buttons with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the camera jumps straight to the angle, with no transition', async ({ page }) => {
    await openDesigner(page);
    // In the same tick as the click the camera is already on the side angle, with no move under way.
    const side = await page.evaluate(() => {
      const { camera: cam, controls, isCameraMoving } = window.__banai.viewer;
      document.querySelector('[data-testid="view-side"]').click();
      return { position: cam.position.toArray(), target: controls.target.toArray(), moving: isCameraMoving() };
    });
    expect(side.moving).toBe(false);
    expect(side.position[2]).toBeCloseTo(side.target[2], 3);
    expect(side.position[0]).toBeGreaterThan(side.target[0] + 3);
  });
});
