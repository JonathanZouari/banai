import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function expectNoViolations(page) {
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter((a) => a.effect?.getTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))));
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const summary = violations.map((v) => `${v.id}: ${v.nodes.map((n) => `${n.target.join(' ')} ${n.any[0]?.message ?? ''}`).join(', ')}`);
  expect(summary, summary.join('\n')).toEqual([]);
}

async function openBasic(page) {
  await page.goto('/');
  await page.getByTestId('entry-basic').click();
  await page.waitForFunction(() => window.__banai?.viewer.meshOf('shf_l1'));
}

test.describe('Hebrew (the default site language)', () => {
  test.use({ siteLanguage: 'he' });

  test('the start screen opens in Hebrew, right to left, with a switch to English', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'he');
    await expect(page.getByRole('heading', { level: 1, name: 'עצב את הארון שלך' })).toBeVisible();
    await expect(page.getByTestId('entry-basic')).toContainText('פתח ארון בסיסי');
    await expect(page.getByRole('region', { name: 'או התחל מתבנית' })).toBeVisible();
    await expect(page.getByTestId('start-screen').getByTestId('site-language')).toHaveText('English');
    await expectNoViolations(page);
  });

  test('the editor is in Hebrew: panel, 3D labels, catalog names and errors', async ({ page }) => {
    await openBasic(page);
    await expect(page.getByRole('heading', { name: 'מאפיינים' })).toBeVisible();
    await expect(page.getByText('רוחב 200.0 ס"מ', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'חזית', exact: true })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'חומר' }).first()).toContainText('לוח מלמין');
    await page.getByTestId('part-shf_l2').click();
    await expect(page.getByTestId('selected-section')).toContainText('נבחר · מדף');
    await expect(page.locator('.dim-label--selected')).toHaveText('מדף · 80.0 ס"מ מהבסיס · עובי 1.8 ס"מ');
    await page.getByTestId('shelf-y').fill('abc');
    await page.getByTestId('shelf-y').press('Enter');
    await expect(page.getByText('הזן מספר בס"מ, למשל 64.5')).toBeVisible();
    await expectNoViolations(page);
  });

  test('the language button sits at the far left in Hebrew (and far right in English)', async ({ page }) => {
    await page.goto('/');
    const startButton = await page.getByTestId('start-screen').getByTestId('site-language').boundingBox();
    expect(startButton.x).toBeLessThan(200);
    await page.getByTestId('entry-basic').click();
    const topButton = await page.locator('#site-language').boundingBox();
    expect(topButton.x).toBeLessThan(200);
    await page.locator('#site-language').click();
    const english = await page.locator('#site-language').boundingBox();
    expect(english.x + english.width).toBeGreaterThan(1440 - 200);
  });

  test('right to left: the chat sits on the right, properties on the left, nothing overflows', async ({ page }) => {
    await openBasic(page);
    const chat = await page.locator('#chat-panel').boundingBox();
    const properties = await page.locator('#properties-panel').boundingBox();
    expect(chat.x).toBeGreaterThan(properties.x);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    // 3D labels stay inside the view
    const view = await page.locator('#viewer').boundingBox();
    const boxes = (await Promise.all((await page.locator('.dim-label').all()).map((label) => label.boundingBox()))).filter(Boolean);
    expect(boxes.length).toBeGreaterThanOrEqual(3);
    for (const box of boxes) {
      expect(box.x).toBeGreaterThanOrEqual(view.x);
      expect(box.x + box.width).toBeLessThanOrEqual(view.x + view.width);
    }
  });

  test('switching to English flips the page, moves the chat to English and is remembered', async ({ page }) => {
    await openBasic(page);
    await page.getByTestId('site-language').click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.getByRole('heading', { name: 'Properties' })).toBeVisible();
    await expect(page.getByText('W 200.0 cm', { exact: true })).toBeVisible();
    await expect(page.getByTestId('site-language')).toHaveText('עברית');
    await expect(page.locator('#chat-panel')).toHaveAttribute('dir', 'ltr');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { level: 1, name: 'Design your wardrobe' })).toBeVisible();
  });

  test('switching language never changes the design', async ({ page }) => {
    await openBasic(page);
    const before = await page.evaluate(() => JSON.stringify(window.__banai.store.getState().design));
    await page.getByTestId('site-language').click();
    await page.getByTestId('site-language').click();
    expect(await page.evaluate(() => JSON.stringify(window.__banai.store.getState().design))).toBe(before);
  });
});

test('buttons are rectangles with rounded corners, not pills', async ({ page }) => {
  await openBasic(page);
  for (const selector of ['#open-save', '#open-render', '#site-language', '[data-view="front"]', '#auto-rotate', '[data-testid="add-compartment"]']) {
    const radius = await page.locator(selector).evaluate((node) => parseFloat(getComputedStyle(node).borderTopLeftRadius));
    expect(radius, selector).toBe(8);
  }
});
