// UX/UI stage 5: review and send. The full customer journey from the homepage to a private link the
// customer sends to the carpenter (email/WhatsApp), with the notes and measured wall saved and printed
// in the PDF. No price and no manufacturing promise. The E2E backend stores designs in memory.
import { test, expect, openStep, expectNoViolations } from './fixtures.js';

// Every test here walks the whole customer journey across several screens (with software WebGL for the
// review picture), so it needs more than the default 30 s; the assertions are unchanged.
test.describe.configure({ timeout: 60_000 });

const LINK = /#d=[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/;
const ok = (data) => ({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
const state = (page) => page.evaluate(() => window.__banai.store.getState());

async function designSomething(page) {
  await page.goto('/');
  await page.getByTestId('home-manual').click();
  await page.waitForFunction(() => window.__banai?.viewer.meshOf('shf_l1'));
  await page.keyboard.type('250');
  await page.keyboard.press('Enter');
  await openStep(page, 'notes');
  await page.getByTestId('notes-input').fill('ידיות שחורות\nמקום לשואב אבק');
  await page.getByTestId('view-room').click();
  for (const [field, value] of [['width', '260'], ['height', '260'], ['depth', '65']]) {
    await page.getByTestId(`room-${field}`).fill(value);
    await page.getByTestId(`room-${field}`).press('Enter');
  }
  await page.getByTestId('obstacle-window').check();
}

test.describe('review and send', () => {
  test('the full journey: design, room, review, edit and come back, save, share, reopen', async ({ page, context }) => {
    await designSomething(page);
    await page.getByTestId('open-review').click();
    const review = page.getByTestId('review');
    await expect(review).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'סיכום העיצוב שלך' })).toBeVisible();
    await expect(page.getByTestId('review-picture')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('review-dimensions')).toContainText('250.0 × 240.0 × 60.0');
    await expect(page.getByTestId('review-notes')).toContainText('ידיות שחורות');
    await expect(page.getByTestId('review-notes')).toContainText('מקום לשואב אבק');
    await expect(page.getByTestId('review-room')).toContainText('הארון נכנס במידות שהזנתם');
    await expect(page.getByTestId('review-room')).toContainText('מכשולים: חלון');
    await expect(page.getByText('אין כאן מחיר או אישור ייצור')).toBeVisible();
    await expect(review).not.toContainText('₪');

    // Edit a part: back to the designer with that step open, and the review keeps everything.
    await page.getByTestId('review-edit-doors').click();
    await expect(page.getByTestId('step-doors')).toHaveJSProperty('open', true);
    await expect(page.getByTestId('step-doors-toggle')).toBeFocused();
    await page.getByTestId('door-type').getByRole('button', { name: 'הזזה' }).click();
    await page.getByTestId('open-review').click();
    await expect(page.getByTestId('review-doors')).toContainText('הזזה · 2 כנפיים');
    await expect(page.getByTestId('review-notes')).toContainText('ידיות שחורות');

    // Save -> private link -> share.
    await expect(page.getByTestId('review-email')).toHaveCount(0); // nothing to send before saving
    await page.getByTestId('review-save').click();
    await expect(page.getByTestId('review-status')).toHaveText('נשמר. הקישור הפרטי מוכן לשליחה.');
    const link = await page.getByTestId('review-link').inputValue();
    expect(link).toMatch(LINK);
    await expect(page).toHaveURL(LINK);
    const mail = await page.getByTestId('review-email').getAttribute('href');
    const whatsapp = await page.getByTestId('review-whatsapp').getAttribute('href');
    expect(decodeURIComponent(mail)).toContain(link);
    expect(decodeURIComponent(whatsapp)).toContain(link);
    expect(whatsapp.startsWith('https://wa.me/?text=')).toBe(true);
    await expect(page.getByTestId('review-whatsapp')).toHaveAttribute('rel', /noopener/);
    await expect(page.getByTestId('review-actions')).toContainText('כל מי שיש לו את הקישור יכול לפתוח ולערוך');

    // The carpenter opens the link: the design, the notes and the measured wall are all there.
    const reopened = await context.newPage();
    await reopened.goto(link);
    await reopened.waitForFunction(() => window.__banai?.viewer.meshOf('shf_l1'));
    const restored = await state(reopened);
    expect(restored.design.dimensions.width).toBe(2500);
    expect(restored.design.doors.type).toBe('sliding');
    expect(restored.request.notes).toBe('ידיות שחורות\nמקום לשואב אבק');
    expect(restored.request.room).toMatchObject({ width: 2600, height: 2600, depth: 650, obstacles: ['window'] });
  });

  test('the PDF for the carpenter includes the customer request (never a photo)', async ({ page }) => {
    await designSomething(page);
    let sent = null;
    await page.route('**/api/export/pdf', async (route) => {
      sent = route.request().postDataJSON();
      await route.continue(); // the real E2E backend renders it
    });
    await page.getByTestId('open-review').click();
    await page.getByTestId('review-pdf').click();
    const download = page.waitForEvent('download');
    await page.getByTestId('export-download').click();
    expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
    expect(sent.request.notes).toBe('ידיות שחורות\nמקום לשואב אבק');
    expect(sent.request.room).toMatchObject({ width: 2600, obstacles: ['window'] });
    expect(JSON.stringify(sent.request)).not.toMatch(/blob:|data:image/);
  });
});

test.describe('saving from the review', () => {
  test.use({ allowedConsoleErrors: [/503/] });

  test('a failed save says so and can be retried; a double click saves once', async ({ page }) => {
    await designSomething(page);
    await page.getByTestId('open-review').click();
    let posts = 0;
    let fail = true;
    await page.route('**/api/designs', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      posts += 1;
      if (fail) {
        return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, error: { code: 'STORAGE_ERROR', message: 'השמירה נכשלה. נסה שוב בעוד רגע.' } }) });
      }
      await new Promise((resolve) => setTimeout(resolve, 400)); // slow enough for a second click to land
      return route.continue();
    });
    await page.getByTestId('review-save').click();
    await expect(page.getByTestId('review-status')).toHaveText('השמירה נכשלה. נסה שוב בעוד רגע.');
    await expect(page.getByTestId('review-save')).toBeEnabled();
    await expect(page.getByTestId('review-link')).toHaveCount(0);

    fail = false;
    posts = 0;
    await page.getByTestId('review-save').dblclick();
    await expect(page.getByTestId('review-link')).toHaveValue(LINK);
    expect(posts).toBe(1);
  });

  test('without storage there is no link to send, but the PDF is still offered', async ({ page }) => {
    await page.route('**/api/health', (route) => route.fulfill(ok({ status: 'ok', env: 'e2e', agent: false, storage: false })));
    await designSomething(page);
    await page.getByTestId('open-review').click();
    await expect(page.getByTestId('review-save')).toBeDisabled();
    await expect(page.getByTestId('review-actions')).toContainText('השמירה אינה זמינה בשרת הזה');
    await expect(page.getByTestId('review-pdf')).toBeEnabled();
  });
});

test.describe('review accessibility and language', () => {
  test('no axe violations before and after saving; the top bar stays usable', async ({ page }) => {
    await designSomething(page);
    await page.getByTestId('open-review').click();
    await expect(page.getByTestId('review-picture')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.topbar')).toHaveJSProperty('inert', false);
    await expect(page.locator('.workspace')).toHaveJSProperty('inert', true);
    await expectNoViolations(page);
    await page.getByTestId('review-save').click();
    await expect(page.getByTestId('review-link')).toBeVisible();
    await expectNoViolations(page);
  });

  test('works in English, and Back returns to where the customer was', async ({ page }) => {
    await designSomething(page); // ends in the room view
    await page.getByTestId('open-review').click();
    await page.getByTestId('ui-language-en').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Your design summary' })).toBeVisible();
    await expect(page.getByTestId('review-room')).toContainText('The wardrobe fits the space you entered');
    await page.goBack();
    await expect(page.getByTestId('review')).toBeHidden();
    await expect(page.locator('#room-panel')).toBeVisible();
  });
});
