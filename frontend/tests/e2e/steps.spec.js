// UX/UI stage 3: the properties panel as five steps with live summaries, clear validation with the
// documented ranges, and a notes step whose text stays plain, clean and outside the design.
import { test, expect, openDesigner, openStep } from './fixtures.js';

const state = (page) => page.evaluate(() => window.__banai.store.getState());
const summary = (page, id) => page.getByTestId(`step-${id}`).locator('.step__value');
// The panel isolates number expressions as LTR runs; compare without the isolate characters.
const ISOLATES = [0x2066, 0x2067, 0x2068, 0x2069].map((code) => String.fromCharCode(code));
const plain = (text) => [...text].filter((char) => !ISOLATES.includes(char)).join('');

test.describe('steps', () => {
  test('five numbered steps; only the first is open, and each shows a summary of its choices', async ({ page }) => {
    await openDesigner(page);
    const ids = ['dimensions', 'doors', 'interior', 'materials', 'notes'];
    for (const id of ids) await expect(page.getByTestId(`step-${id}`)).toBeVisible();
    await expect(page.getByTestId('step-dimensions')).toHaveJSProperty('open', true);
    for (const id of ids.slice(1)) await expect(page.getByTestId(`step-${id}`)).toHaveJSProperty('open', false);
    expect(plain(await summary(page, 'dimensions').textContent())).toBe('200.0 × 240.0 × 60.0 ס״מ');
    await expect(summary(page, 'doors')).toHaveText('צירים · 3 דלתות');
    await expect(summary(page, 'interior')).toContainText('3 תאים');
    await expect(summary(page, 'materials')).toHaveText('לוח מלמין · לבן · מט');
    await expect(summary(page, 'notes')).toHaveText('אין הערות');
    await expect(page.getByTestId('part-shf_l1')).toBeVisible(); // "All parts" stays open (keyboard path)
  });

  test('steps open and close by keyboard, and stay open across design changes', async ({ page }) => {
    await openDesigner(page);
    await page.getByTestId('step-doors-toggle').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('step-doors')).toHaveJSProperty('open', true);
    await page.getByTestId('door-type').getByRole('button', { name: 'הזזה' }).click();
    await expect(summary(page, 'doors')).toHaveText('הזזה · 2 כנפיים'); // live summary
    await expect(page.getByTestId('step-doors')).toHaveJSProperty('open', true); // survived the re-render
    await expect(page.getByTestId('sliding-count')).toBeVisible();
    await page.getByTestId('step-doors-toggle').focus();
    await page.keyboard.press('Space');
    await expect(page.getByTestId('step-doors')).toHaveJSProperty('open', false);
  });

  test('choices are kept and summarised: colour, and a dimension edit', async ({ page }) => {
    await openDesigner(page);
    await openStep(page, 'materials');
    await page.getByRole('button', { name: 'אגוז' }).first().click();
    await expect(summary(page, 'materials')).toHaveText('לוח מלמין · אגוז · מט');
    await page.getByTestId('dim-width').fill('250');
    await page.getByTestId('dim-width').press('Enter');
    await expect.poll(async () => plain(await summary(page, 'dimensions').textContent())).toBe('250.0 × 240.0 × 60.0 ס״מ');
    await expect(summary(page, 'materials')).toHaveText('לוח מלמין · אגוז · מט'); // the colour choice was kept
  });
});

test.describe('dimension validation', () => {
  test('shows the allowed range up front', async ({ page }) => {
    await openDesigner(page);
    expect(plain(await page.getByTestId('dim-range').textContent())).toBe('טווח מותר: רוחב 30–600 · גובה 30–350 · עומק 20–120 ס״מ');
  });

  test('missing, malformed and out-of-range values get a clear Hebrew message and change nothing', async ({ page }) => {
    await openDesigner(page);
    const width = page.getByTestId('dim-width');
    const before = (await state(page)).revision;
    for (const [value, message] of [
      ['', 'הזינו מספר בס״מ, למשל 64.5'],
      ['abc', 'הזינו מספר בס״מ, למשל 64.5'],
      ['<b>1</b>', 'הזינו מספר בס״מ, למשל 64.5'],
      ['700', 'רוחב צריך להיות בין 30 ל-600 ס״מ.'],
      ['29.9', 'רוחב צריך להיות בין 30 ל-600 ס״מ.'],
    ]) {
      await width.fill(value);
      await width.press('Enter');
      await expect(page.getByText(message)).toBeVisible();
      await expect(width).toHaveAttribute('aria-invalid', 'true');
    }
    expect((await state(page)).revision).toBe(before);
    expect((await state(page)).design.dimensions.width).toBe(2000);
  });

  test('the boundaries themselves are accepted', async ({ page }) => {
    await openDesigner(page);
    for (const [field, value, mm] of [['width', '600', 6000], ['width', '30', 300], ['height', '350', 3500]]) {
      await page.getByTestId(`dim-${field}`).fill(value);
      await page.getByTestId(`dim-${field}`).press('Enter');
      await expect.poll(async () => (await state(page)).design.dimensions[field]).toBe(mm);
      await expect(page.getByTestId(`dim-${field}`)).not.toHaveAttribute('aria-invalid', 'true');
    }
  });

  test('a height that would leave shelves outside the wardrobe says why, and changes nothing', async ({ page }) => {
    await openDesigner(page);
    await page.getByTestId('dim-height').fill('30'); // inside the range, but the basic wardrobe's shelves sit higher
    await page.getByTestId('dim-height').press('Enter');
    await expect(page.getByText('בגובה הזה חלק מהמדפים, המגירות או המוטות ייצאו מהארון. הזיזו או הסירו אותם קודם.')).toBeVisible();
    expect((await state(page)).design.dimensions.height).toBe(2400);
  });
});

test.describe('notes', () => {
  test('are typed as plain text, counted, summarised, and kept outside the design', async ({ page }) => {
    await openDesigner(page);
    await openStep(page, 'notes');
    const notes = page.getByTestId('notes-input');
    const before = (await state(page)).revision;
    const text = 'ידיות שחורות <img src=x onerror=alert(1)>';
    await notes.fill(text);
    expect(plain(await page.getByTestId('notes-count').textContent())).toBe(`${text.length} / 1000 תווים`);
    await expect(summary(page, 'notes')).toContainText('ידיות שחורות <img');
    await expect(page.locator('[data-testid="step-notes"] img')).toHaveCount(0); // text, never markup
    const after = await state(page);
    expect(after.request.notes).toBe('ידיות שחורות <img src=x onerror=alert(1)>');
    expect(after.revision).toBe(before); // notes are not a design change
    expect(JSON.stringify(after.design)).not.toContain('ידיות');
  });

  test('drop hidden and reordering characters, cap the length, and survive re-renders and a language switch', async ({ page }) => {
    await openDesigner(page);
    await openStep(page, 'notes');
    const notes = page.getByTestId('notes-input');
    await notes.fill(`מראה${String.fromCodePoint(0x202e)} על הדלת${String.fromCodePoint(0x200b)}`);
    await expect(notes).toHaveValue('מראה על הדלת');
    await expect(notes).toHaveAttribute('maxlength', '1000');
    await page.getByTestId('dim-depth').fill('55');
    await page.getByTestId('dim-depth').press('Enter'); // re-renders the panel
    await expect(page.getByTestId('notes-input')).toHaveValue('מראה על הדלת');
    await page.getByTestId('ui-language-en').click();
    await expect(page.getByTestId('notes-input')).toHaveValue('מראה על הדלת');
    await expect(page.getByTestId('step-notes')).toContainText('Special requests');
    expect((await state(page)).request.notes).toBe('מראה על הדלת');
  });
});
