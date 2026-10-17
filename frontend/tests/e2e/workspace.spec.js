import { readFile } from 'node:fs/promises';
import { expect, openDesigner, test } from './fixtures.js';

// bobHabanai Day 3: the Hebrew RTL workspace on schema v2 (advisories from /api/advisories,
// interior presets and inserts, site, undo/redo, hold-to-compare).
const store = (page) => page.evaluate(() => {
  const { design, history, ui, version } = window.__banai.store.getState();
  return { design, history, comparing: ui.comparing, hasVersion: version !== null };
});
const advice = (page, id) => page.getByTestId(`advice-${id}`);

test.describe('workspace (RTL, schema v2)', () => {
  test.beforeEach(async ({ page }) => openDesigner(page));

  test('the page is Hebrew, right to left', async ({ page }) => {
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'he');
    // The properties column sits on the right, the side column on the left.
    const props = await page.locator('#properties-panel').boundingBox();
    const side = await page.locator('#side-panel').boundingBox();
    expect(props.x).toBeGreaterThan(side.x);
  });

  test('advisories arrive from the API with grade and source, and the tab badge counts warnings', async ({ page }) => {
    const wide = advice(page, 'r3-wide');
    await expect(wide).toBeVisible();
    await expect(wide).toHaveAttribute('data-level', 'warn');
    await expect(wide).toContainText('דלת רחבה מדי לציר סמוי');
    await expect(wide.locator('.advice-src')).toHaveText('[3]');
    await expect(page.getByTestId('tab-advice').locator('.tab-badge')).toHaveText('1');
  });

  test('a quick fix applies through the store, clears its advisory, and undo / redo bring it back', async ({ page }) => {
    await page.getByTestId('advice-fix-r3-wide').click();
    await expect.poll(async () => (await store(page)).design.doors.items.length).toBe(6);
    await expect(advice(page, 'r3-wide')).toHaveCount(0);
    await expect(page.locator('#toast')).toContainText('עודכן');

    await page.locator('body').click({ position: { x: 5, y: 5 } }); // focus outside any text field
    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await store(page)).design.doors.items.length).toBe(3);
    await expect(advice(page, 'r3-wide')).toBeVisible();
    await expect(page.getByTestId('redo')).toBeEnabled();
    await page.getByTestId('redo').click();
    await expect.poll(async () => (await store(page)).design.doors.items.length).toBe(6);
  });

  test('"show" opens the doors, selects the compartment and highlights it', async ({ page }) => {
    await page.getByTestId('advice-show-r11-runner').click();
    await expect.poll(() => page.evaluate(() => window.__banai.store.getState().selection)).toEqual({ id: 'cmp_right', kind: 'compartment' });
    await expect.poll(() => page.evaluate(() => window.__banai.store.getState().ui.doorsOpen)).toBe(true);
  });

  test('a compartment takes a preset, inserts and a split door; advisories follow', async ({ page }) => {
    await page.getByTestId('select-cmp_middle').click();
    await page.getByTestId('preset-double').click();
    await expect.poll(async () => (await store(page)).design.compartments[1].rails.length).toBe(2);

    await page.getByTestId('insert-led').click();
    await expect(page.getByTestId('insert-led')).toHaveAttribute('aria-pressed', 'true');
    await expect(advice(page, 'r19-led')).toBeVisible();

    await page.getByTestId('insert-shoes').click();
    await expect.poll(async () => (await store(page)).design.compartments[1].inserts.map((x) => x.type).sort()).toEqual(['led', 'shoes']);

    await page.getByTestId('split-door').check();
    await expect.poll(async () => (await store(page)).design.doors.items.filter((d) => d.compartmentIds[0] === 'cmp_middle').length).toBe(2);
    await page.getByTestId('split-door').uncheck();
    await expect.poll(async () => (await store(page)).design.doors.items.length).toBe(3);
  });

  test('site measurements switch on the ceiling advisory; clearing the field switches it off', async ({ page }) => {
    const ceiling = page.getByTestId('site-ceiling');
    await ceiling.fill('242');
    await ceiling.press('Enter');
    await expect(advice(page, 'r1-lift')).toBeVisible();
    await expect(page.getByTestId('advice-fix-r1-lift')).toHaveText('הנמך ל-233 ס״מ');
    await ceiling.fill('');
    await ceiling.press('Enter');
    await expect(advice(page, 'r1-lift')).toHaveCount(0);
    expect((await store(page)).design.site).toBeNull();
  });

  test('a slider drag is one undo step', async ({ page }) => {
    const slider = page.getByTestId('dim-width-slider');
    const box = await slider.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 6; i += 1) await page.mouse.move(box.x + box.width / 2 - i * 12, box.y + box.height / 2);
    await page.mouse.up();
    const after = await store(page);
    expect(after.design.dimensions.width).not.toBe(2000);
    expect(after.history.undo).toBe(1);
  });

  test('hold to compare shows the saved version and lists what differs', async ({ page }) => {
    await page.getByTestId('version-save').click();
    const width = page.getByTestId('dim-width');
    await width.fill('240');
    await width.press('Enter');
    await expect.poll(async () => (await store(page)).design.dimensions.width).toBe(2400);

    const hold = page.getByTestId('compare-hold');
    const box = await hold.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect(page.getByTestId('compare-card')).toBeVisible();
    await expect(page.getByTestId('compare-card')).toContainText('רוחב: 240 ס״מ ← 200 ס״מ');
    expect((await store(page)).comparing).toBe(true);
    await page.mouse.up();
    await expect(page.getByTestId('compare-card')).toBeHidden();
    expect((await store(page)).comparing).toBe(false);
    expect((await store(page)).design.dimensions.width).toBe(2400);
  });

  test('the carpenter dossier downloads as a PDF built by the server (ADR-019)', async ({ page }) => {
    test.setTimeout(60_000); // Chromium renders the PDF on the server
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('open-dossier').click()]);
    expect(download.suggestedFilename()).toBe('banai-dossier.pdf');
    const pdf = await readFile(await download.path());
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(50_000);
    await expect(page.getByTestId('open-dossier')).toHaveText('תיק נגר');
  });
});
