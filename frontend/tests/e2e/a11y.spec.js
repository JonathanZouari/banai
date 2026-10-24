import { test, expect, openDesigner, selection, expectNoViolations } from './fixtures.js';

test.describe('accessibility (axe, WCAG 2.2 AA)', () => {
  test('homepage', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('home').waitFor();
    await expectNoViolations(page);
  });

  // One full-page scan per test: two scans of the live WebGL page in one test came within a few
  // seconds of the 30 s timeout on a busy machine (software rendering keeps the CPU busy).
  test('editor without a selection', async ({ page }) => {
    await openDesigner(page);
    await expectNoViolations(page);
  });

  test('editor with a shelf selected', async ({ page }) => {
    await openDesigner(page);
    await page.getByTestId('part-shf_l1').click();
    await page.getByTestId('selected-section').waitFor();
    await expectNoViolations(page);
  });

  for (const id of ['open-save', 'open-render', 'open-export']) {
    test(`dialog ${id}`, async ({ page }) => {
      await openDesigner(page);
      await page.getByTestId(id).click();
      await page.locator('dialog[open]').waitFor();
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
    const shelf = page.getByTestId('part-shf_l1');
    await shelf.focus();
    await page.keyboard.press('Enter');
    expect(await selection(page)).toEqual({ id: 'shf_l1', kind: 'shelf' });
    await expect(page.getByTestId('selected-section')).toContainText('מדף');
    await expect(page.getByTestId('part-shf_l1')).toBeFocused(); // focus survives the re-render
  });

  test('choosing the basic wardrobe moves focus into the properties panel', async ({ page }) => {
    await openDesigner(page);
    await expect(page.locator('#properties-panel')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('dim-width')).toBeFocused();
  });

  test('the skip link moves focus to the properties panel and keeps the private link', async ({ page, context }) => {
    // A design reopened from its private link loads straight into the editor with nothing focused,
    // so the skip link is the first tab stop of the page.
    await openDesigner(page);
    await page.getByTestId('open-save').click();
    await page.getByTestId('save-confirm').click();
    await expect(page.getByTestId('share-link')).toHaveValue(/#d=/);
    const link = await page.getByTestId('share-link').inputValue();
    const reopened = await context.newPage();
    await reopened.goto(link);
    await reopened.waitForFunction(() => window.__banai?.viewer.meshOf('shf_l1'));
    await reopened.keyboard.press('Tab');
    await expect(reopened.getByRole('link', { name: 'דילוג למאפיינים' })).toBeVisible();
    await expect(reopened.getByRole('link', { name: 'דילוג למאפיינים' })).toBeFocused();
    await reopened.keyboard.press('Enter');
    await expect(reopened.locator('#properties-panel')).toBeFocused();
    expect(reopened.url()).toBe(link); // the hash holds the private design link and must not change
  });
});

test.describe('form errors', () => {
  test('an invalid value is flagged and described, and a valid one clears it', async ({ page }) => {
    await openDesigner(page);
    const depth = page.getByTestId('dim-depth');
    await depth.fill('abc');
    await depth.press('Enter');
    await expect(depth).toHaveAttribute('aria-invalid', 'true');
    const messageId = await depth.getAttribute('aria-describedby');
    await expect(page.locator(`#${messageId}`)).not.toBeEmpty();
    await depth.fill('70');
    await depth.press('Enter');
    await expect(page.getByTestId('dim-depth')).not.toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByTestId('dim-depth')).toHaveValue('70.0');
  });
});
