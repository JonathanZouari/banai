// Visual regression: full-page screenshots compared with reviewed baselines in __screenshots__/.
// Update a baseline only after looking at the diff in the HTML report and approving the change
// (npx playwright test tests/e2e/visual.spec.js --update-snapshots). Desktop only (product decision).
import { test, expect, openDesigner } from './fixtures.js';

async function settle(page) {
  await page.evaluate(() => document.fonts.ready);
  // Two frames, so the WebGL canvas and CSS2D labels have drawn the current state.
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
}

test.describe('visual regression (desktop 1440×900)', () => {
  test('start screen', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('start-screen')).toBeVisible();
    await settle(page);
    await expect(page).toHaveScreenshot('start-screen.png');
  });

  test('designer with the basic wardrobe', async ({ page }) => {
    await openDesigner(page);
    await settle(page);
    await expect(page).toHaveScreenshot('designer-basic.png');
  });
});
