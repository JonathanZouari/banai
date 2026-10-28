import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures.js';

test.use({ showTour: true });

async function startFresh(page) {
  await page.goto('/');
  await page.getByTestId('auth-guest').click();
  await page.getByTestId('entry-basic').click();
}

const step = (page) => page.getByTestId('tour-bubble').getAttribute('data-step');

test.describe('first-visit tour', () => {
  test('appears once after the start screen and walks through the five steps', async ({ page }) => {
    await startFresh(page);
    const bubble = page.getByTestId('tour-bubble');
    await expect(bubble).toContainText('כאן מדברים עם המעצב');
    await expect(bubble).toContainText('1 מתוך 5');
    await expect(page.getByTestId('tour-next')).toBeFocused();
    await page.getByTestId('tour-next').click();
    await expect(bubble).toContainText('כאן עורכים ידנית');
    await page.getByTestId('tour-next').click();
    await expect(bubble).toContainText('כאן מסובבים את הארון');
    await page.getByTestId('tour-back').click();
    expect(await step(page)).toBe('manual');
    await page.getByTestId('tour-next').click();
    await page.getByTestId('tour-next').click();
    await expect(bubble).toContainText('רוצים ארון מוכן?');
    await page.getByTestId('tour-next').click();
    expect(await step(page)).toBe('help');
    await page.getByTestId('tour-next').click(); // Done
    await expect(page.getByTestId('tour')).toHaveCount(0);

    await page.reload();
    await page.getByTestId('auth-guest').click();
    await page.getByTestId('entry-basic').click();
    await expect(page.getByTestId('open-save')).toBeVisible();
    await expect(page.getByTestId('tour')).toHaveCount(0); // remembered
  });

  test('Esc skips it for good, and "?" replays it', async ({ page }) => {
    await startFresh(page);
    await expect(page.getByTestId('tour-bubble')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('tour')).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('banai.tour.v1'))).toBe('done');

    await page.getByTestId('open-tour').click();
    expect(await step(page)).toBe('chat');
    await page.keyboard.press('ArrowLeft'); // next, in RTL
    expect(await step(page)).toBe('manual');
    await page.keyboard.press('ArrowRight'); // back
    expect(await step(page)).toBe('chat');
  });

  test('every "try it" step moves on by itself once the customer tries it', async ({ page }) => {
    await startFresh(page);
    const tryNote = page.getByTestId('tour-try');
    await expect(tryNote).toContainText('נסו עכשיו');

    await page.getByTestId('suggestion').first().click(); // chat: fills the composer only
    await expect(tryNote).toContainText('מעולה');
    await expect.poll(() => step(page)).toBe('manual');
    expect(await page.evaluate(() => window.__banai.chat.getMessages().length)).toBe(0); // nothing sent

    await page.getByTestId('part-shf_l1').click(); // manual: pick a part
    await expect.poll(() => step(page)).toBe('rotate');

    const box = await page.locator('#viewer canvas').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 260, box.y + box.height / 2, { steps: 12 });
    await page.mouse.up();
    await expect.poll(() => step(page)).toBe('examples');

    await page.getByTestId('open-presets').click(); // examples: the button alone is not enough
    await page.getByTestId('presets-dialog').getByRole('button', { name: 'סגור' }).click();
    await expect(tryNote).toContainText('נסו עכשיו');
    expect(await step(page)).toBe('examples');
    await page.getByTestId('open-presets').click();
    await page.getByTestId('preset-open-kids').click(); // picking a template is
    await expect(tryNote).toContainText('מעולה');
    await expect.poll(() => step(page)).toBe('help');
    expect(await page.evaluate(() => window.__banai.store.getState().design.dimensions.width)).toBe(1500);
  });

  test('the tour has no accessibility violations', async ({ page }) => {
    await startFresh(page);
    await expect(page.getByTestId('tour-bubble')).toBeVisible();
    const results = await new AxeBuilder({ page }).include('[data-testid="tour"]').analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});
