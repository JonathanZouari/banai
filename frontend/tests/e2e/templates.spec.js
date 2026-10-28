import { expect, openDesigner, test } from './fixtures.js';

const current = (page) => page.evaluate(() => {
  const { design, ui } = window.__banai.store.getState();
  return { width: design.dimensions.width, doors: design.doors.type, backdrop: ui.backdrop };
});

test.describe('Wardrobe templates', () => {
  test('the start screen lists the templates in Hebrew and opens the chosen one with its room', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('auth-guest').click();
    await expect(page.getByTestId('entry-preset').locator('option[value="kids"]')).toHaveText('ארון ילדים (150 × 200 × 55 ס"מ)');
    await page.getByTestId('entry-preset').selectOption('kids');
    await page.getByTestId('entry-basic').click();
    await page.waitForFunction(() => window.__banai?.viewer.meshOf('rail_h1'));
    expect(await current(page)).toEqual({ width: 1500, doors: 'hinged', backdrop: 'kids_room' });
  });

  test('the basic wardrobe opens in a bedroom', async ({ page }) => {
    await openDesigner(page);
    expect(await current(page)).toEqual({ width: 2000, doors: 'hinged', backdrop: 'bedroom' });
  });

  test('"Ready-made examples" lists every template and switches the design', async ({ page }) => {
    await openDesigner(page);
    await expect(page.getByTestId('open-presets')).toHaveText('דוגמאות מוכנות');
    await page.getByTestId('open-presets').click();
    const dialog = page.getByTestId('presets-dialog');
    await expect(dialog.locator('.preset-item')).toHaveCount(6);
    await expect(dialog).toContainText('ארון זוגי עם דלתות הזזה');
    await dialog.getByTestId('preset-open-double_sliding').click();
    await expect(dialog).not.toBeVisible();
    await page.waitForFunction(() => window.__banai.viewer.meshOf('drw_m3'));
    expect(await current(page)).toEqual({ width: 2400, doors: 'sliding', backdrop: 'master_bedroom' });

    await page.getByTestId('open-presets').click();
    await dialog.getByTestId('preset-open-open_shelving').click();
    await page.waitForFunction(() => window.__banai.viewer.meshOf('shf_r4'));
    expect(await current(page)).toEqual({ width: 1600, doors: 'none', backdrop: 'study' });
  });

  test('the chat offers every ready-made example and opens one without calling the AI', async ({ page }) => {
    await openDesigner(page);
    let chatCalls = 0;
    await page.route('**/api/chat', (route) => { chatCalls += 1; return route.abort(); });
    const toggle = page.getByTestId('chat-examples');
    await expect(toggle).toHaveText('דוגמאות מוכנות');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('[data-testid^="chat-example-"]')).toHaveCount(6);
    await page.getByTestId('chat-example-hallway').click();
    await page.waitForFunction(() => window.__banai.viewer.meshOf('rail_c1'));
    expect(await current(page)).toEqual({ width: 1200, doors: 'hinged', backdrop: 'entrance' });
    expect(chatCalls).toBe(0);
  });

  test('switching the UI to English shows the templates in English', async ({ page }) => {
    await openDesigner(page);
    await page.getByRole('button', { name: 'EN', exact: true }).click();
    await expect(page.getByTestId('open-presets')).toHaveText('Ready-made examples');
    await page.getByTestId('open-presets').click();
    await expect(page.getByTestId('presets-dialog')).toContainText("Kids' wardrobe");
  });
});
