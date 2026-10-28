import AxeBuilder from '@axe-core/playwright';
import { test, expect, openDesigner } from './fixtures.js';

// The image service is mocked: E2E never calls OpenAI.
const ok = (data) => ({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

async function withRender(page, respond) {
  const requests = [];
  await page.route('**/api/health', (route) => route.fulfill(ok({ status: 'ok', env: 'e2e', agent: true, render: true, storage: true })));
  await page.route('**/api/render', async (route) => {
    requests.push(route.request().postDataJSON());
    await respond(route);
  });
  await openDesigner(page);
  await page.getByTestId('open-render').click();
  return requests;
}

const committed = (page) => page.evaluate(() => {
  const { design, revision } = window.__banai.store.getState();
  return JSON.stringify({ design, revision });
});

test.describe('AI photoreal render', () => {
  test('generates an illustrative image from the committed design without changing it', async ({ page }) => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const requests = await withRender(page, async (route) => {
      await gate;
      await route.fulfill(ok({ image: PIXEL, disclaimer: 'Illustrative image, not the accurate 3D model' }));
    });
    const before = await committed(page);
    const dialog = page.getByTestId('render-dialog');
    await expect(dialog).toContainText('Illustrative image, not the accurate 3D model');
    await expect(page.getByTestId('render-download')).toBeDisabled();

    await page.getByTestId('render-generate').click();
    await expect(page.getByTestId('render-generate')).toBeDisabled();
    await expect(page.getByTestId('render-status')).toContainText('Creating your image');
    await expect(page.getByTestId('render-preview')).toHaveAttribute('aria-busy', 'true');
    release();

    await expect(page.getByTestId('render-image')).toHaveAttribute('src', PIXEL);
    await expect(page.getByTestId('render-image')).toHaveAttribute('alt', /200 × 240 × 60 cm/);
    await expect(page.getByTestId('render-status')).toHaveText('Your image is ready.');
    await expect(page.getByTestId('render-download')).toBeEnabled();
    await expect(page.getByTestId('render-generate')).toBeEnabled();

    expect(requests).toHaveLength(1);
    const [sent] = requests;
    expect(Object.keys(sent).sort()).toEqual(['design', 'image', 'language']);
    expect(sent.image).toMatch(/^data:image\/jpeg;base64,/);
    expect(JSON.stringify(sent.design)).toBe(JSON.stringify(JSON.parse(before).design));
    expect(await committed(page)).toBe(before);

    const download = page.waitForEvent('download');
    await page.getByTestId('render-download').click();
    expect((await download).suggestedFilename()).toBe('banai-render-2000x2400x600mm.jpg');
  });

  test.describe('when rendering fails', () => {
    test.use({ allowedConsoleErrors: [/status of 429/] });

    test('shows the server message', async ({ page }) => {
      await withRender(page, (route) => route.fulfill({
        status: 429, contentType: 'application/json',
        body: JSON.stringify({ success: false, error: { code: 'RATE_LIMITED', message: 'Too many renders in a short time.' } }),
      }));
      await page.getByTestId('render-generate').click();
      await expect(page.getByTestId('render-status')).toHaveText('Too many renders in a short time.');
      await expect(page.getByTestId('render-image')).toHaveCount(0);
      await expect(page.getByTestId('render-generate')).toBeEnabled();
      await expect(page.getByTestId('render-download')).toBeDisabled();
    });
  });

  test('the render dialog has no accessibility violations', async ({ page }) => {
    await withRender(page, (route) => route.fulfill(ok({ image: PIXEL, disclaimer: '' })));
    await page.getByTestId('render-generate').click();
    await expect(page.getByTestId('render-image')).toBeVisible();
    await page.evaluate(() => Promise.all(document.getAnimations()
      .filter((a) => a.effect?.getTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))));
    const { violations } = await new AxeBuilder({ page }).include('[data-testid="render-dialog"]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(violations.map((v) => v.id)).toEqual([]);
  });
});
