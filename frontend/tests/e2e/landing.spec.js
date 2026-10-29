import { test, expect } from './fixtures.js';

const dialog = (page) => page.getByTestId('start-screen');

/** Scroll the start screen so a pinned section is at progress p (0..1). */
async function scrollSection(page, id, p) {
  await page.evaluate(([sectionId, progress]) => {
    const start = document.querySelector('.start');
    const section = document.getElementById(sectionId);
    const stage = section.querySelector('.landing-stage');
    start.scrollTop = section.offsetTop - 64 + progress * (section.offsetHeight - stage.clientHeight);
  }, [id, p]);
}

test.describe('landing page', () => {
  test('tells the story from drawing to a photoreal room, then reaches the ways in', async ({ page }) => {
    await page.goto('/');
    await expect(dialog(page)).toBeVisible();
    await expect(page.locator('#landing-story .landing-story__title')).toHaveText('It starts as a drawing.');
    await expect(page.locator('#landing-story .landing-drawing__line').first()).toBeAttached();

    await scrollSection(page, 'landing-story', 1);
    await expect(page.locator('#landing-story canvas.landing-canvas')).toHaveCount(1); // built once scrolled
    await expect(page.locator('#landing-story .landing-story__title')).toHaveText('This is your wardrobe.');
    const photo = page.locator('.landing-story__photo');
    await expect(photo).toHaveAttribute('alt', /AI-rendered photoreal preview/);
    await expect.poll(() => photo.evaluate((img) => img.complete && img.naturalWidth)).toBeGreaterThan(0);
    await expect(page.getByText('AI-rendered preview. Illustrative only')).toBeVisible();

    await page.locator('.landing-story__cta').click();
    await expect(page.getByTestId('entry-basic')).toBeInViewport();
  });

  test('the inside tour shows real measurements from the basic wardrobe', async ({ page }) => {
    await page.goto('/');
    await scrollSection(page, 'landing-inside', 0.12);
    await expect(page.locator('.landing-callout__title')).toHaveText('Hanging rail');
    await expect(page.locator('.landing-callout__spec')).toHaveText('1918 mm from the floor');
    await scrollSection(page, 'landing-inside', 0.99);
    await expect(page.locator('.landing-callout__title')).toHaveText('Doors and handles');
  });

  test('the materials studio applies a catalog choice live', async ({ page }) => {
    await page.goto('/');
    await page.locator('.start__nav-link', { hasText: 'Materials' }).click();
    const oak = page.getByTestId('landing-color-natural_oak');
    await oak.click();
    await expect(oak).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('landing-color-white')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.landing-studio__name')).toHaveText('Natural oak');
    await page.getByTestId('landing-handle-knob').click();
    await expect(page.locator('.landing-studio__meta')).toContainText('Knob');
  });

  test('switches to Hebrew, right to left, and still opens the editor', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('landing-lang-he').click();
    await expect(dialog(page)).toHaveAttribute('dir', 'rtl');
    await expect(dialog(page)).toHaveAttribute('lang', 'he');
    await expect(page.getByRole('heading', { name: 'תכננו את הארון שלכם' })).toBeAttached();
    await page.getByTestId('entry-basic').click();
    await expect(dialog(page)).toHaveCount(0);
    await page.waitForFunction(() => window.__banai?.viewer.meshOf('shf_l1'));
  });

  test('with reduced motion it shows the finished state without scrubbing', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.locator('#landing-story .landing-story__title')).toHaveText('This is your wardrobe.');
    await expect(page.locator('.landing-story__cta')).toBeVisible();
  });

  test('closing the start screen releases the landing scenes', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' }); // an instant jump: a smooth scroll past every section is slow on software WebGL
    await page.goto('/');
    await page.locator('.start__nav-link', { hasText: 'Materials' }).click();
    await expect(page.locator('#landing-materials canvas.landing-canvas')).toHaveCount(1);
    await page.getByTestId('entry-basic').click();
    await expect(page.locator('canvas.landing-canvas')).toHaveCount(0);
  });

  test('"Start designing" in the header opens the designer', async ({ page }) => {
    await page.goto('/');
    await page.locator('.start__nav-start').click();
    await expect(dialog(page)).toHaveCount(0);
    await page.waitForFunction(() => window.__banai?.viewer.meshOf('shf_l1'));
  });

  test('"Build this wardrobe" opens the designer in the look chosen in the studio', async ({ page }) => {
    await page.goto('/');
    await page.locator('.start__nav-link', { hasText: 'Materials' }).click();
    await page.getByTestId('landing-color-sage').click();
    await page.getByTestId('landing-handle-knob').click();
    await page.getByTestId('landing-look-inside').click();
    await expect(page.getByTestId('landing-look-inside')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('landing-build').click();
    await expect(dialog(page)).toHaveCount(0);
    await page.waitForFunction(() => window.__banai?.viewer.meshOf('shf_l1'));
    const design = await page.evaluate(() => window.__banai.store.getState().design);
    expect(design.doors.appearance.color.catalogId).toBe('sage');
    expect(design.carcass.appearance.color.catalogId).toBe('sage');
    expect(design.doors.handles.style).toBe('knob');
  });
});
