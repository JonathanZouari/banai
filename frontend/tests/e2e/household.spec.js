import { test, expect, openDesigner } from './fixtures.js';

const household = (page) => page.evaluate(() => window.__banai.store.getState().household);
const figureCount = (page) => page.evaluate(() => window.__banai.viewer.figureCount);

test.describe('household figures and child safety', () => {
  test.beforeEach(async ({ page }) => openDesigner(page));

  test('an adult and a child stand beside the wardrobe; the child raises the climbing warning', async ({ page }) => {
    await expect(page.getByTestId('child-safety')).toHaveCount(0);
    await page.getByTestId('add-adult').click();
    await expect(page.getByTestId('child-safety')).toHaveCount(0); // an adult alone: no warning
    await page.getByTestId('add-child').click();
    expect((await household(page)).map((p) => p.height)).toEqual([1700, 1000]);
    await expect.poll(() => figureCount(page)).toBe(2);
    const alert = page.getByTestId('child-safety');
    await expect(alert).toContainText('לקבע את הארון לקיר');
    await expect(page.getByTestId('child-lock-suggestion')).toContainText('נעילת הגנה');
    await expect(page.getByTestId('child-lock-suggestion')).toContainText('130 ס״מ');
  });

  test('the household survives a reload and is never part of the design', async ({ page }) => {
    await page.getByTestId('add-child').click();
    const { design } = await page.evaluate(() => window.__banai.store.getState());
    expect(JSON.stringify(design)).not.toContain('household');
    await page.reload();
    await page.getByTestId('entry-basic').click();
    expect((await household(page)).map((p) => p.height)).toEqual([1000]);
  });

  test('removing a person moves the focus to the next one, then the previous one, then "+ מבוגר"', async ({ page }) => {
    for (let i = 0; i < 3; i += 1) await page.getByTestId('add-adult').click();
    const [first, second, third] = await household(page);
    await expect(page.getByTestId(`person-remove-${first.id}`)).toHaveAttribute('aria-label', 'הסרת אדם 1');
    await page.getByTestId(`person-remove-${second.id}`).click();
    await expect(page.getByTestId(`person-remove-${third.id}`)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId(`person-remove-${first.id}`)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('add-adult')).toBeFocused();
    expect(await household(page)).toEqual([]);
  });

  test('at 8 people the add buttons explain the limit instead of going dead', async ({ page }) => {
    for (let i = 0; i < 8; i += 1) await page.getByTestId('add-adult').click();
    const add = page.getByTestId('add-child');
    await expect(add).toHaveAttribute('aria-disabled', 'true');
    await expect(add).not.toHaveAttribute('disabled', ''); // not natively disabled: it keeps its focus
    await add.focus();
    await expect(add).toBeFocused();
    await expect(page.getByTestId('household-limit')).toHaveText('אפשר להוסיף עד 8 אנשים. כדי להוסיף, הסירו מישהו.');
    await page.keyboard.press('Enter'); // pressing it does nothing
    expect(await household(page)).toHaveLength(8);
  });
});
