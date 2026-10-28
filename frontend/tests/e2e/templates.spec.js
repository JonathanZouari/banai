import { expect, test } from './fixtures.js';

const design = (page) => page.evaluate(() => window.__banai.store.getState().design);
const ready = (page) => page.waitForFunction(() => window.__banai?.viewer && window.__banai.store.getState().design.compartments.length > 0);

test.describe('starting templates', () => {
  test('the start screen offers the three templates next to the three entry cards', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('start-screen')).toBeVisible();
    for (const id of ['guided', 'freeText', 'basic']) await expect(page.getByTestId(`entry-${id}`)).toBeVisible();
    for (const [id, name] of [['kids', "Kids' wardrobe 150 cm"], ['double-sliding', 'Double wardrobe with sliding doors'], ['minimalist', 'Minimalist wardrobe']]) {
      await expect(page.getByTestId(`template-${id}`)).toContainText(name);
    }
  });

  test('the kids template opens the editor with a 150 cm wardrobe', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('template-kids').click();
    await expect(page.getByTestId('start-screen')).toBeHidden();
    await ready(page);
    const d = await design(page);
    expect(d.dimensions).toEqual({ width: 1500, height: 1800, depth: 500 });
    expect(d.compartments).toHaveLength(2);
    expect(d.doors.type).toBe('hinged');
    await expect(page.getByTestId('dim-width')).toHaveValue('150.0');
    await expect(page.getByTestId('dim-height')).toHaveValue('180.0');
  });

  test('the double template opens with three sliding doors', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('template-double-sliding').click();
    await ready(page);
    const d = await design(page);
    expect(d.dimensions.width).toBe(2400);
    expect(d.doors.type).toBe('sliding');
    expect(d.doors.items).toHaveLength(3);
    await expect(page.getByTestId('dim-width')).toHaveValue('240.0');
  });

  test('the minimalist template opens with one rail and three shelves', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('template-minimalist').click();
    await ready(page);
    const d = await design(page);
    expect(d.dimensions).toEqual({ width: 1800, height: 2400, depth: 500 });
    expect(d.compartments.flatMap((c) => c.rails)).toHaveLength(1);
    expect(d.compartments.flatMap((c) => c.shelves)).toHaveLength(3);
  });

  test('focus lands on the Properties panel, and the template can be edited and accepted by the server', async ({ page, request }) => {
    await page.goto('/');
    await page.getByTestId('template-kids').click();
    await ready(page);
    await expect(page.locator('#properties-panel')).toBeFocused();
    // A manual edit works on the template design (it is the canonical state like any other).
    const input = page.getByTestId('dim-width');
    await input.fill('160');
    await input.press('Enter');
    expect((await design(page)).dimensions.width).toBe(1600);
    // The server validates the same design (the agent, saving and the PDF all use the backend engine).
    const edited = await design(page);
    const response = await request.post('http://localhost:8010/api/export/pdf', { data: { design: edited, language: 'en' } });
    expect(response.status()).toBe(200);
  });

  test('keyboard: a template can be chosen with Tab and Enter', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('template-minimalist').focus();
    await expect(page.getByTestId('template-minimalist')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('start-screen')).toBeHidden();
    await ready(page);
    expect((await design(page)).dimensions.width).toBe(1800);
  });

  test('the basic card still opens the basic wardrobe', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('entry-basic').click();
    await ready(page);
    expect((await design(page)).dimensions).toEqual({ width: 2000, height: 2400, depth: 600 });
  });

  test('the strip fits a narrow screen without sideways scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 700, height: 900 });
    await page.goto('/');
    await expect(page.getByTestId('template-kids')).toBeVisible();
    const overflow = await page.evaluate(() => document.querySelector('dialog.start').scrollWidth - document.querySelector('dialog.start').clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
