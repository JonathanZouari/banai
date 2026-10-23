import { clickComponent, expect, openDesigner, selection, test } from './fixtures.js';

const camera = (page) => page.evaluate(() => ({
  position: window.__banai.viewer.camera.position.toArray(),
  target: window.__banai.viewer.controls.target.toArray(),
}));
const designState = (page) => page.evaluate(() => {
  const { design, revision } = window.__banai.store.getState();
  return JSON.stringify({ design, revision });
});
// A transition lasts ~600 ms. Waiting on a fixed delay avoids racing the first animation frame
// (the camera is still at the start pose right after a click).
const settled = (page) => page.waitForTimeout(950);

test.describe('camera angle buttons', () => {
  test.beforeEach(async ({ page }) => openDesigner(page));

  test('show Hebrew labels by default and English labels when the chat language changes', async ({ page }) => {
    const group = page.getByTestId('view-controls');
    await expect(group).toBeVisible();
    await expect(group).toHaveAttribute('lang', 'he');
    await expect(page.getByTestId('view-front')).toHaveText('חזית');
    await expect(page.getByTestId('view-side')).toHaveText('צד');
    await expect(page.getByTestId('view-3q')).toHaveText('3/4');
    await expect(page.getByTestId('view-reset')).toHaveText('איפוס');
    await page.getByTestId('chat-language-en').click();
    await expect(page.getByTestId('view-front')).toHaveText('Front');
    await expect(page.getByTestId('view-reset')).toHaveText('Reset');
    await expect(group).toHaveAttribute('lang', 'en');
  });

  test('Front, Side and 3/4 move the camera to the right place, smoothly', async ({ page }) => {
    const centre = [1, 1.2, -0.3]; // basic wardrobe 2000 x 2400 x 600 mm, scene metres
    const start = await camera(page);

    await page.getByTestId('view-front').click();
    // Moving, not a jump: some frame shows a pose that is neither the start nor the end.
    await expect.poll(async () => JSON.stringify((await camera(page)).position)).not.toBe(JSON.stringify(start.position));
    await settled(page);
    const front = await camera(page);
    expect(front.position[0]).toBeCloseTo(centre[0], 2);
    expect(front.position[1] - centre[1]).toBeGreaterThanOrEqual(0);
    expect(front.position[1] - centre[1]).toBeLessThan(0.15); // level, within the orbit limit
    expect(front.position[2]).toBeGreaterThan(centre[2] + 2);

    await page.getByTestId('view-side').click();
    await settled(page);
    const side = await camera(page);
    expect(side.position[0]).toBeGreaterThan(centre[0] + 2);
    expect(side.position[1] - centre[1]).toBeGreaterThanOrEqual(0);
    expect(side.position[1] - centre[1]).toBeLessThan(0.15);
    expect(side.position[2]).toBeCloseTo(centre[2], 2);

    await page.getByTestId('view-3q').click();
    await settled(page);
    const threeQuarter = await camera(page);
    expect(threeQuarter.position[0] - centre[0]).toBeCloseTo(threeQuarter.position[2] - centre[2], 2);
    expect(threeQuarter.position[0]).toBeGreaterThan(centre[0] + 1);
    for (const view of [front, side, threeQuarter]) {
      view.target.forEach((value, i) => expect(value).toBeCloseTo(centre[i], 2));
    }
  });

  test('never changes the design, revision or selection', async ({ page }) => {
    await clickComponent(page, 'shf_l1');
    const selected = await selection(page);
    expect(selected).toBeTruthy();
    const before = await designState(page);
    for (const view of ['view-front', 'view-side', 'view-3q', 'view-reset']) {
      await page.getByTestId(view).click();
      await settled(page);
    }
    expect(await designState(page)).toBe(before);
    expect(await selection(page)).toEqual(selected);
  });

  test('Reset returns to the default pose after the user orbited by hand', async ({ page }) => {
    const initial = await camera(page);
    const box = await page.locator('#viewer canvas').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.7);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 220, box.y + box.height * 0.7 + 30, { steps: 10 });
    await page.mouse.up();
    await settled(page);
    expect((await camera(page)).position).not.toEqual(initial.position);

    await page.getByTestId('view-reset').click();
    await settled(page);
    const reset = await camera(page);
    reset.position.forEach((value, i) => expect(value).toBeCloseTo(initial.position[i], 2));
  });

  test('a user drag takes over from a running transition', async ({ page }) => {
    await page.getByTestId('view-side').click();
    const box = await page.locator('#viewer canvas').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.7);
    await page.mouse.down(); // controls "start" cancels the transition
    await page.mouse.up();
    await settled(page);
    const stopped = await camera(page);
    await page.waitForTimeout(900);
    expect((await camera(page)).position).toEqual(stopped.position); // did not continue to the side view
  });
});
