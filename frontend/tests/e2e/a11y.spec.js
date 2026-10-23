import AxeBuilder from '@axe-core/playwright';
import { test, expect, openDesigner, reveal, selection } from './fixtures.js';

// IS 5568 part 1 adopts WCAG at level AA. Ported from dev's fd5b146 to this branch's UI.
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
// The WebGL canvas and its pencil labels are drawn over a 3D scene axe cannot measure: colour contrast there is
// checked by eye, the rest of the page by axe.
const EXCLUDE = ['#viewer'];

async function expectNoViolations(page) {
  // Let entrance animations (fades) finish, or axe measures half-transparent text.
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter((a) => a.effect?.getTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))));
  let builder = new AxeBuilder({ page }).withTags(TAGS);
  for (const selector of EXCLUDE) builder = builder.exclude(selector);
  const { violations } = await builder.analyze();
  const summary = violations.map((v) => `${v.id}: ${v.nodes.map((n) => `${n.target.join(' ')} ${n.any[0]?.message ?? ''}`).join(', ')}`);
  expect(summary, summary.join('\n')).toEqual([]);
}

test.describe('accessibility (axe, WCAG 2.1 AA)', () => {
  test.slow();

  test('start screen', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('start-screen').waitFor();
    await page.locator('.atl-bob-line.is-on').waitFor(); // Bob's line fades in on a timer: measure it once it is in
    await expectNoViolations(page);
  });

  test('editor, with and without a selection', async ({ page }) => {
    await openDesigner(page);
    await expectNoViolations(page);
    await page.locator('[data-testid^="part-shf_"]').first().click();
    await page.getByTestId('selected-section').waitFor();
    await expectNoViolations(page);
  });

  for (const id of ['open-save', 'open-customer']) {
    test(`dialog ${id}`, async ({ page }) => {
      await openDesigner(page);
      await reveal(page, id);
      await page.getByTestId(id).click();
      await page.locator('dialog[open]').last().waitFor();
      await expectNoViolations(page);
    });
  }

  test('accessibility statement page', async ({ page }) => {
    await page.goto('/accessibility.html');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('הצהרת נגישות');
    await expect(page.getByRole('link', { name: 's.jzouari@gmail.com' })).toBeVisible();
    await expectNoViolations(page);
  });
});

test.describe('keyboard only', () => {
  test('a shelf can be selected without the mouse', async ({ page }) => {
    await openDesigner(page);
    const shelf = page.locator('[data-testid^="part-shf_"]').first();
    const id = (await shelf.getAttribute('data-testid')).slice('part-'.length);
    await shelf.focus();
    await page.keyboard.press('Enter');
    expect(await selection(page)).toEqual({ id, kind: 'shelf' });
    await expect(page.getByTestId(`part-${id}`)).toHaveAttribute('aria-current', 'true');
  });

  test('the skip link moves focus to the design panel and keeps the address', async ({ page }) => {
    await openDesigner(page);
    const before = page.url();
    await page.getByTestId('skip-link').focus();
    await expect(page.getByTestId('skip-link')).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.locator('#properties-panel')).toBeFocused();
    expect(page.url()).toBe(before);
  });

  test('the statement is linked from the Help menu and the start screen', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('start-a11y')).toHaveAttribute('href', '/accessibility.html');
    await openDesigner(page);
    await reveal(page, 'a11y-link');
    await expect(page.getByTestId('a11y-link')).toHaveAttribute('href', '/accessibility.html');
  });
});
