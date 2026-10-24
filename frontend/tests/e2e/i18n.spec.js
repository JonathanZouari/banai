// UX/UI stage 1: Hebrew is the default, the whole app is RTL, and the top-bar switch changes every
// text (editor, 3D labels, chat, dialogs) to English and back, by keyboard too, and is remembered.
import { test, expect, openDesigner, expectNoViolations } from './fixtures.js';

const box = (locator) => locator.boundingBox();

test.describe('Hebrew (default) and RTL', () => {
  test('the page is Hebrew and right-to-left, with the chat on the right and properties on the left', async ({ page }) => {
    await openDesigner(page);
    await expect(page.locator('html')).toHaveAttribute('lang', 'he');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { name: 'מאפיינים' })).toBeVisible();
    await expect(page.getByTestId('dim-width')).toBeVisible();
    await expect(page.getByText('רוחב', { exact: true }).first()).toBeVisible();
    const [chat, viewer, properties] = await Promise.all([
      box(page.locator('#chat-panel')), box(page.locator('#viewer')), box(page.locator('#properties-panel')),
    ]);
    expect(chat.x).toBeGreaterThan(viewer.x);
    expect(properties.x).toBeLessThan(viewer.x);
  });

  test('catalog names, units and the selected-part label are Hebrew', async ({ page }) => {
    await openDesigner(page);
    await expect(page.getByRole('button', { name: 'לבן' }).first()).toBeVisible();
    await expect(page.locator('.topbar__units')).toHaveText('ס״מ');
    await page.evaluate(() => window.__banai.store.select('shf_l1'));
    await expect(page.getByTestId('selected-section')).toContainText('נבחר · מדף');
    await expect(page.locator('.dim-label--selected')).toContainText('ס״מ מהבסיס');
  });
});

test.describe('language switch', () => {
  test('switching to English by keyboard changes every part of the app, and the selection is kept', async ({ page }) => {
    await openDesigner(page);
    await page.evaluate(() => window.__banai.store.select('shf_l1'));
    await page.getByTestId('ui-language-en').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByTestId('ui-language-en')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('heading', { name: 'Properties' })).toBeVisible();
    await expect(page.getByText('W 200.0 cm', { exact: true })).toBeVisible();
    await expect(page.getByTestId('selected-section')).toContainText('Selected · Shelf');
    await expect(page.locator('.dim-label--selected')).toHaveText('Shelf · 40.0 cm from base · 1.8 cm thick');
    await expect(page.getByTestId('chat-welcome')).toContainText('What shall we design today?');
    await expect(page).toHaveTitle('BanAI Wardrobe Designer');
    // Dialogs are built in the language that is current when they open.
    await page.getByTestId('open-save').click();
    await expect(page.getByTestId('save-dialog')).toContainText('Save your design');
    await page.getByTestId('save-close').click();
    // And back to Hebrew.
    await page.getByTestId('ui-language-he').click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByText('רוחב 200.0 ס״מ', { exact: true })).toBeVisible();
    await page.getByTestId('open-save').click();
    await expect(page.getByTestId('save-dialog')).toContainText('שמירת העיצוב');
  });

  test('the choice is remembered after a reload, and the start screen has its own switch', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('start-language-en').click();
    await expect(page.getByRole('heading', { name: 'Design your wardrobe' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Design your wardrobe' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await page.getByTestId('start-language-he').click();
    await expect(page.getByRole('heading', { name: 'עצבו את הארון שלכם' })).toBeVisible();
    await expect(page.getByTestId('start-language-he')).toHaveAttribute('aria-pressed', 'true');
  });

  test('no accessibility violations in English either', async ({ page }) => {
    await openDesigner(page);
    await page.getByTestId('ui-language-en').click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expectNoViolations(page);
  });
});
