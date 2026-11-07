// UX/UI stage 4: room fit (ADR-008). Wall measurements and a basic fit check, obstacles, a room photo
// that never leaves the browser, an illustrative wardrobe layer on it, and colour suggestions from
// the AI based on the customer's text (never the photo).
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { test, expect, openDesigner, expectNoViolations } from './fixtures.js';

const ROOM_PNG = fileURLToPath(new URL('./assets/room.png', import.meta.url));
const ok = (data) => ({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
const state = (page) => page.evaluate(() => window.__banai.store.getState());

async function openRoom(page) {
  await openDesigner(page);
  await page.getByTestId('view-room').click();
  await expect(page.getByTestId('room-stage-empty')).toBeVisible();
}

async function setWall(page, field, value) {
  await page.getByTestId(`room-${field}`).fill(value);
  await page.getByTestId(`room-${field}`).press('Enter');
}

async function upload(page, files) {
  await page.getByTestId('room-photo-input').setInputFiles(files);
}

test.describe('room view', () => {
  test('opens from the top bar, replaces the 3D view and properties, and Back returns to the designer', async ({ page }) => {
    await openRoom(page);
    await expect(page.getByTestId('view-room')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#room-panel')).toBeVisible();
    await expect(page.locator('#properties-panel')).toBeHidden();
    await expect(page.locator('#room-panel')).toBeFocused();
    await expect(page.getByTestId('room-design-summary')).toContainText('צירים');
    await expect(page.getByTestId('fit-status')).toHaveText('הזינו את מידות הקיר כדי לבדוק התאמה');
    await page.goBack();
    await expect(page.locator('#properties-panel')).toBeVisible();
    await expect(page.locator('#room-stage')).toBeHidden();
    await expect(page.getByTestId('view-designer')).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('fit check', () => {
  test('too big, missing and fitting measurements, with the honest notes', async ({ page }) => {
    await openRoom(page);
    await setWall(page, 'width', '180');
    await expect(page.getByTestId('fit-status')).toHaveText('הארון גדול מהמקום שהזנתם');
    await expect(page.getByTestId('fit-width')).toHaveText('רוחב: גדול ב-20.0 ס״מ מהמקום');
    await expect(page.getByTestId('fit-height')).toHaveText('גובה: לא הוזן');
    await setWall(page, 'width', '250');
    await expect(page.getByTestId('fit-status')).toHaveText('חסרות מידות לבדיקה מלאה');
    await setWall(page, 'height', '260');
    await setWall(page, 'depth', '65');
    await expect(page.getByTestId('fit-status')).toHaveText('הארון נכנס במידות שהזנתם');
    await expect(page.getByTestId('fit-width')).toHaveText('רוחב: 200.0 מתוך 250.0 ס״מ');
    const result = page.getByTestId('fit-result');
    await expect(result).toContainText('זו בדיקה בסיסית של מידות בלבד');
    await expect(result).toContainText('לדלתות ציר צריך מקום פנוי לפתיחה'); // the basic wardrobe has hinged doors
    await expect(result).not.toContainText('מכשולים');
    await page.getByTestId('obstacle-window').check();
    await expect(result).toContainText('סימנתם מכשולים ליד הקיר');
    expect((await state(page)).request.room).toMatchObject({ width: 2500, height: 2600, depth: 650, obstacles: ['window'] });
  });

  test('invalid and out-of-range measurements are explained and not stored', async ({ page }) => {
    await openRoom(page);
    await setWall(page, 'width', 'abc');
    await expect(page.getByText('הזינו מספר בס״מ, למשל 64.5')).toBeVisible();
    await setWall(page, 'width', '0.5');
    await expect(page.getByText('הזינו מספר בין 1 ל-2000 ס״מ.')).toBeVisible();
    await setWall(page, 'width', '2500');
    await expect(page.getByText('הזינו מספר בין 1 ל-2000 ס״מ.')).toBeVisible();
    expect((await state(page)).request.room.width).toBeNull();
    await setWall(page, 'width', '250');
    await setWall(page, 'width', '');
    expect((await state(page)).request.room.width).toBeNull(); // clearing a measurement is allowed
  });

  test('follows the design: a wider wardrobe no longer fits', async ({ page }) => {
    await openRoom(page);
    await setWall(page, 'width', '250');
    await setWall(page, 'height', '260');
    await setWall(page, 'depth', '65');
    await expect(page.getByTestId('fit-status')).toHaveText('הארון נכנס במידות שהזנתם');
    await page.getByTestId('view-designer').click();
    await page.getByTestId('dim-width').fill('260');
    await page.getByTestId('dim-width').press('Enter');
    await page.getByTestId('view-room').click();
    await expect(page.getByTestId('fit-status')).toHaveText('הארון גדול מהמקום שהזנתם');
    await expect(page.getByTestId('fit-width')).toHaveText('רוחב: גדול ב-10.0 ס״מ מהמקום');
  });
});

test.describe('room photo: replace frees the old one', () => {
  // The test itself proves the old object URL was revoked by fetching it; that fetch fails on purpose.
  test.use({ allowedConsoleErrors: [/ERR_FILE_NOT_FOUND/] });

  test('upload, preview with the approximate wardrobe layer, replace and remove', async ({ page }) => {
    await openRoom(page);
    const chooser = page.waitForEvent('filechooser');
    await page.getByTestId('room-photo-choose').click(); // the visible button opens the file picker
    await (await chooser).setFiles(ROOM_PNG);
    await expect(page.getByTestId('room-photo')).toBeVisible();
    await expect(page.getByTestId('room-photo')).toHaveAttribute('src', /^blob:/);
    await expect(page.getByTestId('room-overlay-label')).toHaveText('הדמיה משוערת בלבד, לא מדידה ולא התחייבות להתקנה');
    await expect(page.getByTestId('room-overlay')).toBeVisible({ timeout: 20_000 });
    const first = await page.getByTestId('room-photo').getAttribute('src');

    await upload(page, { name: 'second.png', mimeType: 'image/png', buffer: await readFile(ROOM_PNG) });
    await expect(page.getByTestId('room-photo')).not.toHaveAttribute('src', first);
    expect(await page.evaluate(async (url) => fetch(url).then(() => 'alive', () => 'revoked'), first)).toBe('revoked');

    await page.getByTestId('room-photo-remove').click();
    await expect(page.getByTestId('room-stage-empty')).toBeVisible();
    await expect(page.getByTestId('room-photo-choose')).toBeFocused();
  });
});

test.describe('room photo', () => {
  test('wrong type, broken, empty and too-large files are refused with a clear message', async ({ page }) => {
    await openRoom(page);
    const error = page.getByTestId('room-photo-error');
    const cases = [
      [{ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') }, 'אפשר להעלות רק תמונה מסוג JPG, PNG או WebP.'],
      [{ name: 'logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>') }, 'אפשר להעלות רק תמונה מסוג JPG, PNG או WebP.'],
      [{ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('this is not really a png file') }, 'לא הצלחנו לפתוח את התמונה. ייתכן שהקובץ פגום.'],
      [{ name: 'empty.png', mimeType: 'image/png', buffer: Buffer.alloc(0) }, 'הקובץ ריק.'],
      [{ name: 'huge.png', mimeType: 'image/png', buffer: Buffer.alloc(10 * 1024 * 1024 + 1) }, 'התמונה גדולה מ-10MB. נסו תמונה קטנה יותר.'],
    ];
    for (const [file, message] of cases) {
      await upload(page, file);
      await expect(error).toHaveText(message);
      await expect(page.getByTestId('room-photo')).toHaveCount(0);
    }
    await upload(page, ROOM_PNG); // a good photo afterwards clears the message
    await expect(page.getByTestId('room-photo')).toBeVisible();
    await expect(error).toHaveText('');
  });

  test('the photo never leaves the browser', async ({ page }) => {
    const bodies = [];
    page.on('request', (request) => {
      const body = request.postDataBuffer();
      bodies.push({ url: request.url(), method: request.method(), size: body?.length ?? 0, png: body ? body.includes(Buffer.from([0x89, 0x50, 0x4e, 0x47])) : false });
    });
    await openRoom(page);
    await expect(page.getByTestId('room-photo-error')).toBeAttached();
    await expect(page.locator('#room-panel')).toContainText('התמונה נשארת במחשב שלכם');
    await upload(page, ROOM_PNG);
    await expect(page.getByTestId('room-overlay')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('room-style').fill('קירות לבנים ופרקט בהיר');
    await page.getByTestId('room-recommend').click(); // the AI request carries text only
    await page.waitForTimeout(500);
    expect(bodies.filter((entry) => entry.png)).toEqual([]); // no request carries image bytes
    expect(bodies.filter((entry) => entry.size > 50_000)).toEqual([]);
    // Every request is either the page reading its own local photo (blob:, a GET with no body) or
    // goes to our own frontend/backend: nothing is sent anywhere else.
    const local = (url) => url.startsWith('blob:') || /^http:\/\/localhost:(5183|8010)\//.test(url);
    expect(bodies.filter((entry) => !local(entry.url))).toEqual([]);
    expect(bodies.filter((entry) => entry.url.startsWith('blob:') && (entry.method !== 'GET' || entry.size > 0))).toEqual([]);
    expect(bodies.some((entry) => entry.url.startsWith('blob:'))).toBe(true); // the preview really used the local file
  });
});

test.describe('wardrobe layer', () => {
  test('moves and resizes by keyboard and with buttons (an alternative to dragging)', async ({ page }) => {
    await openRoom(page);
    await upload(page, ROOM_PNG);
    const layer = page.getByTestId('room-overlay');
    await expect(layer).toBeVisible({ timeout: 20_000 });
    const position = async () => layer.evaluate((node) => ({ x: Number(node.dataset.x), y: Number(node.dataset.y), height: Number(node.dataset.height) }));
    const start = await position();
    await layer.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('+');
    const moved = await position();
    expect(moved.x).toBeGreaterThan(start.x);
    expect(moved.y).toBeLessThan(start.y);
    expect(moved.height).toBeGreaterThan(start.height);
    await page.getByTestId('overlay-smaller').click();
    await page.getByTestId('overlay-left').click();
    expect((await position()).x).toBeCloseTo(start.x, 3);
    await page.getByTestId('overlay-reset').click();
    expect(await position()).toEqual(start);
  });
});

test.describe('colour suggestions', () => {
  test('need a room description, and send text (never the photo) to the AI designer', async ({ page }) => {
    const calls = [];
    await page.route('**/api/health', (route) => route.fulfill(ok({ status: 'ok', env: 'e2e', agent: true })));
    await page.route('**/api/chat', async (route) => {
      calls.push(route.request().postDataJSON());
      await route.fulfill(ok({ reply: 'לקירות לבנים מתאים אלון טבעי בגימור מט.', proposal: null }));
    });
    await openRoom(page);
    await page.getByTestId('room-recommend').click();
    await expect(page.getByTestId('room-recommend-status')).toHaveText('כתבו קודם איך נראה החדר.');
    expect(calls).toHaveLength(0);
    await page.getByTestId('room-style').fill('קירות לבנים, פרקט אלון בהיר');
    await page.getByTestId('room-recommend').click();
    await expect(page.getByTestId('chat-messages')).toContainText('לקירות לבנים מתאים אלון טבעי');
    expect(calls).toHaveLength(1);
    const sent = calls[0].messages.at(-1).text;
    expect(sent).toContain('קירות לבנים, פרקט אלון בהיר');
    expect(sent).toContain('200.0 × 240.0 × 60.0');
    expect(JSON.stringify(calls[0])).not.toContain('blob:');
  });
});

test.describe('room view accessibility and language', () => {
  test('no axe violations, empty and with a photo', async ({ page }) => {
    await openRoom(page);
    await expectNoViolations(page);
    await upload(page, ROOM_PNG);
    await expect(page.getByTestId('room-overlay')).toBeVisible({ timeout: 20_000 });
    await expectNoViolations(page);
  });

  test('switching to English keeps the room data', async ({ page }) => {
    await openRoom(page);
    await setWall(page, 'width', '180');
    await page.getByTestId('room-style').fill('white walls');
    await page.getByTestId('ui-language-en').click();
    await expect(page.getByTestId('fit-status')).toHaveText('The wardrobe is larger than the space you entered');
    await expect(page.getByTestId('room-width')).toHaveValue('180.0');
    await expect(page.getByTestId('room-style')).toHaveValue('white walls');
    await expect(page.getByTestId('view-room')).toHaveText('Room fit');
  });
});
