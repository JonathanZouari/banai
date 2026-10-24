// Visual regression: full-page screenshots compared with reviewed baselines in __screenshots__/.
// Update a baseline only after looking at the diff in the HTML report and approving the change
// (npx playwright test tests/e2e/visual.spec.js --update-snapshots). Desktop only (product decision).
import { fileURLToPath } from 'node:url';
import { test, expect, openDesigner } from './fixtures.js';

async function settle(page) {
  await page.evaluate(() => document.fonts.ready);
  // Two frames, so the WebGL canvas and CSS2D labels have drawn the current state.
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
}

test.describe('visual regression (desktop 1440×900)', () => {
  test('homepage', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('home')).toBeVisible();
    await settle(page);
    await expect(page).toHaveScreenshot('homepage.png');
  });

  test('designer with the basic wardrobe', async ({ page }) => {
    await openDesigner(page);
    await settle(page);
    await expect(page).toHaveScreenshot('designer-basic.png');
  });

  test('room fit with a photo and the wardrobe layer', async ({ page }) => {
    await openDesigner(page);
    await page.getByTestId('view-room').click();
    await page.getByTestId('room-photo-input').setInputFiles(fileURLToPath(new URL('./assets/room.png', import.meta.url)));
    await expect(page.getByTestId('room-overlay')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('room-width').fill('250');
    await page.getByTestId('room-width').press('Enter');
    await page.locator('#room-panel').evaluate((panel) => { panel.scrollTop = 0; });
    await settle(page);
    await expect(page).toHaveScreenshot('room-fit.png');
  });
});
