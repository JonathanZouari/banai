import { test, expect, openDesigner, openChat } from './fixtures.js';

// The user's list (2026-10-19): a warning pop-up with ways to fix, and projects in the browser
// (new, save, open, "ניקוי מסך" = start over).
const store = (page) => page.evaluate(() => window.__banai.store.getState());
const sheet = (page) => page.getByTestId('alert-sheet');

async function fill(page, testId, value) {
  const field = page.getByTestId(testId);
  await field.fill(value);
  await field.press('Enter');
}

test.describe('warning pop-up', () => {
  test('a change that brings a new warning pops it up with its fix; the opened design itself does not', async ({ page }) => {
    await openDesigner(page);
    await expect(page.getByTestId('advice-r3-wide')).toBeVisible(); // warnings the design opened with...
    await expect(sheet(page)).toBeHidden(); // ...are the starting point, not a change
    await fill(page, 'site-clearance', '60');
    await expect(sheet(page)).toBeVisible();
    await expect(sheet(page)).toContainText('אין מקום לפתוח את הדלת');
    await expect(page.getByTestId('alert-fix')).toHaveText('פצל לשתי דלתות');
    await page.getByTestId('alert-fix').click();
    expect((await store(page)).design.doors.items.length).toBeGreaterThan(3);
    await expect(page.getByTestId('advice-r21-swing')).toHaveCount(0);
  });

  test('"keep it" leaves the design as it is, and the warning stays in the advice tab', async ({ page }) => {
    await openDesigner(page);
    await fill(page, 'site-clearance', '60');
    const before = (await store(page)).design;
    await page.getByTestId('alert-keep').click();
    await expect(sheet(page)).toBeHidden();
    expect((await store(page)).design).toEqual(before);
    await expect(page.getByTestId('advice-r21-swing')).toBeVisible();
  });

  test('"ask Bob" opens the chat with the question written, not sent', async ({ page }) => {
    await openDesigner(page);
    await fill(page, 'site-clearance', '60');
    await page.getByTestId('alert-ask').click();
    await expect(page.getByTestId('chat-input')).toBeFocused();
    await expect(page.getByTestId('chat-input')).toHaveValue(/אין מקום לפתוח את הדלת/);
    await expect(page.getByTestId('chat-messages')).not.toContainText('אין מקום לפתוח את הדלת');
  });

  test('pop-ups can be switched off, and stay off after a reload', async ({ page }) => {
    await openDesigner(page);
    await fill(page, 'site-clearance', '60');
    await page.getByTestId('alert-mute').click();
    await expect(sheet(page)).toBeHidden();
    await openDesigner(page);
    await fill(page, 'site-clearance', '40');
    await expect(page.getByTestId('advice-r21-swing')).toBeVisible();
    await expect(sheet(page)).toBeHidden();
  });
});

test.describe('projects in the browser', () => {
  test('save, start over ("ניקוי מסך") with a prompt, and open the saved project again', async ({ page }) => {
    await openDesigner(page);
    await fill(page, 'site-clearance', '120');
    await page.getByTestId('open-save').click();
    await page.getByTestId('project-name').fill('חדר שינה');
    await page.getByTestId('save-confirm').click();
    await expect(page.getByTestId('project-status')).toHaveText('נשמר: חדר שינה');
    await expect(page.getByTestId('project-item')).toHaveCount(1);
    await page.getByTestId('save-close').click();

    await fill(page, 'site-clearance', '150'); // an unsaved change
    await page.getByTestId('new-project').click();
    await expect(page.getByTestId('project-confirm')).toBeVisible();
    await page.getByTestId('project-confirm-discard').click();
    await expect(page.getByTestId('start-screen')).toBeVisible(); // a fresh start begins where a visit begins
    await page.getByTestId('entry-basic').click();
    expect((await store(page)).design.site).toBeNull();
    expect((await store(page)).history).toEqual({ undo: 0, redo: 0 });

    await page.getByTestId('open-save').click();
    await page.getByTestId('project-item').getByRole('button', { name: 'פתיחה' }).click();
    await expect(page.getByTestId('save-dialog')).toBeHidden();
    expect((await store(page)).design.site.clearance).toBe(1200);
  });

  test('Alt+N starts over at once when nothing is unsaved, and clears the chat', async ({ page }) => {
    await openDesigner(page);
    await openChat(page);
    await page.getByTestId('chat-input').fill('שלום');
    await page.getByTestId('chat-send').click();
    await expect(page.getByTestId('chat-messages')).toContainText('שלום');
    await page.keyboard.press('Escape');
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Alt+KeyN');
    await expect(page.getByTestId('start-screen')).toBeVisible();
    await page.getByTestId('entry-basic').click();
    await openChat(page);
    await expect(page.getByTestId('chat-messages')).not.toContainText('שלום');
  });

  test('a project file opens; anything else is refused and changes nothing', async ({ page }) => {
    await openDesigner(page);
    const design = (await store(page)).design;
    const file = { app: 'banai', version: 1, name: 'מהקובץ', design: { ...design, dimensions: { ...design.dimensions, depth: 550 } } };
    await page.getByTestId('open-save').click();
    await page.getByTestId('project-import-file').setInputFiles({ name: 'x.banai.json', mimeType: 'application/json', buffer: Buffer.from('{"app":"other"}') });
    await expect(page.getByTestId('project-status')).toHaveText('זה לא קובץ פרויקט של בנאי.');
    expect((await store(page)).design).toEqual(design);
    await page.getByTestId('project-import-file').setInputFiles({ name: 'good.banai.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
    await expect(page.getByTestId('save-dialog')).toBeHidden();
    expect((await store(page)).design.dimensions.depth).toBe(550);
  });
});

test.describe('top bar', () => {
  test('"פתיחה" opens the saved projects', async ({ page }) => {
    await openDesigner(page);
    await page.getByTestId('open-save').click();
    await page.getByTestId('project-name').fill('ארון ילדים');
    await page.getByTestId('save-confirm').click();
    await page.getByTestId('save-close').click();
    await page.getByTestId('open-project').click();
    await expect(page.getByTestId('save-dialog')).toBeVisible();
    await expect(page.getByTestId('project-item')).toContainText('ארון ילדים');
    await expect(page.getByTestId('project-item').getByRole('button', { name: 'פתיחה' })).toBeFocused();
  });

  test('the video button records: clicking a video option starts it, and the button cancels it', async ({ page }) => {
    await openDesigner(page);
    await page.getByTestId('open-video').click();
    await page.getByTestId('video-quick').click();
    await expect(page.getByTestId('open-video')).toContainText(/מקליט/, { timeout: 15_000 });
    await page.getByTestId('open-video').click();
    await expect(page.getByTestId('open-video')).toHaveText('סרטון', { timeout: 15_000 });
  });
});
