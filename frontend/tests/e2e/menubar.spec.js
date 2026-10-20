import { test, expect, openDesigner } from './fixtures.js';

test.describe('top menu bar', () => {
  test.beforeEach(async ({ page }) => openDesigner(page));

  test('has File, Tools, Settings, Help and About, one open at a time', async ({ page }) => {
    const names = await page.locator('.menubar-menu > summary').evaluateAll((nodes) => nodes.map((n) => n.textContent.trim()));
    expect(names.map((name) => name.replace(/\d+$/, ''))).toEqual(['קובץ', 'כלים', 'הגדרות', 'עזרה', 'אודות']);
    await page.getByTestId('menu-file-button').click();
    await expect(page.getByTestId('open-project')).toBeVisible();
    await page.getByTestId('menu-tools-button').click();
    await expect(page.getByTestId('open-project')).toBeHidden();
    await expect(page.getByTestId('open-render')).toBeVisible();
    await page.mouse.click(5, 300); // a press outside closes it
    await expect(page.getByTestId('open-render')).toBeHidden();
  });

  test('File holds save, open, new and the two productions', async ({ page }) => {
    await page.getByTestId('menu-file-button').click();
    for (const id of ['menu-save', 'open-project', 'new-project', 'open-video', 'open-dossier']) {
      await expect(page.getByTestId(id)).toBeVisible();
    }
    await expect(page.getByTestId('open-video')).toHaveText('הפקת סרטון');
    await expect(page.getByTestId('open-dossier')).toHaveText('הפקת תוכנית לנגר');
  });

  test('Tools mirror undo and redo, and the health check reports the server', async ({ page }) => {
    await page.getByTestId('menu-tools-button').click();
    await expect(page.getByTestId('menu-undo')).toBeDisabled();
    await page.evaluate(() => window.__banai.store.dispatch([{ op: 'update_dimensions', width: 2400 }]));
    await expect(page.getByTestId('menu-undo')).toBeEnabled();
    await page.getByTestId('menu-undo').click();
    await expect(page.locator('#toast')).toContainText('בוטל');
    await page.getByTestId('menu-tools-button').click();
    await expect(page.getByTestId('menu-redo')).toBeEnabled();
    await page.getByTestId('check-health').click();
    await expect(page.locator('#toast')).toContainText('השרת תקין', { timeout: 10_000 });
  });

  test('Settings opens the customer details and the AI settings', async ({ page }) => {
    await page.getByTestId('menu-settings-button').click();
    await page.getByTestId('open-customer').click();
    await expect(page.locator('dialog[open]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await page.getByTestId('menu-settings-button').click();
    await page.getByTestId('open-ai-settings').click();
    await expect(page.locator('dialog[open]')).toBeVisible();
  });

  test('Help counts the advice, and offers contact by phone and WhatsApp', async ({ page }) => {
    await expect(page.getByTestId('help-badge')).toBeVisible(); // the count shows on the closed menu
    await expect(page.getByTestId('help-badge')).toHaveText((await page.locator('#advice-badge').textContent()) ?? '');
    await page.getByTestId('menu-help-button').click();
    await expect(page.getByTestId('tab-advice').locator('.tab-badge')).toBeVisible();
    await expect(page.getByTestId('contact-phone')).toHaveText('051-234-5678');
    await expect(page.getByTestId('contact-phone')).toHaveAttribute('href', 'tel:+972512345678');
    await expect(page.getByTestId('contact-whatsapp')).toHaveAttribute('href', /^https:\/\/wa\.me\/972512345678/);
    await expect(page.getByTestId('contact-whatsapp')).toHaveAttribute('rel', /noopener/);
  });

  test('About shows Bob, a fictional update check, the version and the copyright', async ({ page }) => {
    await page.getByTestId('menu-about-button').click();
    await expect(page.getByTestId('menu-updates')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('menu-version')).toContainText(/\d+\.\d+\.\d+/);
    await expect(page.getByTestId('menu-copyright')).toContainText('2026 אריאל קורן');
    await page.getByTestId('open-about').click();
    await expect(page.getByTestId('about-dialog')).toBeVisible();
    await expect(page.getByTestId('about-dialog')).toContainText('יהונתן');
    await expect(page.getByTestId('about-dialog')).not.toContainText('בנאי נולד');
  });
});
