import { test, expect, openDesigner } from './fixtures.js';

// The atelier start screen and the About page (P3, approved 2026-10-17): a 3D wardrobe with pencil dimensions,
// Bob's greeting, three glass cards that lead into the editor, and the fictional master carpenter's story.
// Under Playwright the renderer is SwiftShader, so the wardrobe is drawn once (the "still" mode).
const start = (page) => page.getByTestId('start-screen');

test.describe('atelier start screen', () => {
  test('draws the wardrobe with its pencil dimensions, then Bob says hello', async ({ page }) => {
    await page.goto('/');
    await expect(start(page)).toBeVisible();
    await expect(page.locator('#start-title')).toBeFocused(); // the heading, not a language button
    const size = await page.locator('.atl-hero__canvas').evaluate((c) => [c.width, c.height]);
    expect(size[0]).toBeGreaterThan(300); // sized to the hero, not the 300 x 150 default
    await expect(page.locator('.atl-hero__dims .dim__label').first()).toHaveText('240 ס״מ');
    await expect(page.locator('.atl-hero__dims .dim__label').nth(1)).toHaveText('250 ס״מ');
    await expect(page.getByTestId('bob-greeting')).toHaveText('היי, אני בוב. ספרו לי מה צריך להיכנס לארון, ואני אשרטט.', { timeout: 10_000 });
    await expect(page.locator('.atl-hero__measured .measure__pill text')).toHaveText('עד המילימטר');
  });

  test('"Meet Bob" scrolls to the About page, which says the story is fictional', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('start-about').click();
    const about = start(page).getByTestId('about');
    await expect(about.getByRole('heading', { name: /שלושים שנה בסדנה/ })).toBeInViewport();
    await expect(about).toContainText('בוב · מאסטר נגר');
    await expect(about).toContainText('דמות בדיונית');
    await expect(about.locator('.stat__value').nth(1)).toHaveText('1,284', { timeout: 5_000 });
    await expect(about.locator('.bob svg')).toHaveCount(1);
  });

  test('a card leads into the editor and frees the start screen\'s 3D', async ({ page }) => {
    await openDesigner(page);
    await expect(start(page)).toHaveCount(0);
    await expect(page.locator('canvas')).toHaveCount(1); // the editor's viewer only
    expect(await page.evaluate(() => document.documentElement.classList.contains('is-start-open'))).toBe(false);
    await expect(page.getByText('רוחב 200.0 ס״מ', { exact: true })).toBeVisible();
  });

  test('the About page opens from the top bar and closes with Escape', async ({ page }) => {
    await openDesigner(page);
    await page.getByTestId('open-about').click();
    const dialog = page.getByTestId('about-dialog');
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('about-close')).toBeFocused();
    await expect(dialog.getByRole('heading', { name: /שלושים ואחת שנה/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await page.getByTestId('open-about').click();
    await page.getByTestId('about-close').click();
    await expect(page.getByTestId('about-dialog')).toHaveCount(0);
  });

  test('reduced motion: the greeting and the figures are there at once, nothing counts up', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.getByTestId('bob-greeting')).toHaveText(/היי, אני בוב/, { timeout: 1_500 });
    const values = await start(page).locator('.stat__value').allTextContents();
    expect(values).toEqual(['31', '1,284', '20', '1']);
  });
});

test.describe('atelier start screen on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('fills the screen without sideways scrolling and stacks the cards', async ({ page }) => {
    await page.goto('/');
    await expect(start(page)).toBeVisible();
    const box = await start(page).boundingBox();
    expect(Math.round(box.width)).toBe(390);
    expect(await start(page).evaluate((d) => d.scrollWidth - d.clientWidth)).toBe(0);
    const lefts = await page.locator('.atl-entry').evaluateAll((cards) => cards.map((c) => Math.round(c.getBoundingClientRect().left)));
    expect(new Set(lefts).size).toBe(1); // one column
    await page.getByTestId('entry-guided').click();
    await expect(start(page)).toHaveCount(0);
  });
});
