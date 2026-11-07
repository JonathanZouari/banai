// UX/UI stage 2: the homepage. One central AI field, "Design my wardrobe", manual dimensions and a
// basic-wardrobe link; all lead to the same editor. The workspace stays inert under the homepage.
import { test, expect } from './fixtures.js';

const ok = (data) => ({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
const revision = (page) => page.evaluate(() => window.__banai.store.getState().revision);
const width = (page) => page.evaluate(() => window.__banai.store.getState().design.dimensions.width);
const designerReady = (page) => page.waitForFunction(() => window.__banai?.viewer.meshOf('shf_l1'));

/** A connected agent at the network edge (the E2E backend has no OpenAI key). */
async function mockAgent(page) {
  const calls = [];
  await page.route('**/api/health', (route) => route.fulfill(ok({ status: 'ok', env: 'e2e', agent: true })));
  await page.route('**/api/chat', async (route) => {
    const body = route.request().postDataJSON();
    calls.push(body);
    await route.fulfill(ok({
      reply: 'הנה הצעה לארון ברוחב 240 ס״מ.',
      proposal: {
        proposalId: 'prp_0123456789abcdef', baseRevision: body.revision, baseHash: 'a'.repeat(64),
        ops: [{ op: 'update_dimensions', width: 2400 }], signature: 'b'.repeat(64),
        summary: 'Makes the wardrobe wider.', changes: [{ title: 'רוחב', detail: '200.0 ס״מ ← 240.0 ס״מ' }],
      },
    }));
  });
  return calls;
}

test.describe('homepage', () => {
  test('is shown first: headline, AI field, both actions, ideas and the disclaimer; the workspace is inert', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('home')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'עצבו ארון שמתאים בדיוק לכם' })).toBeVisible();
    await expect(page.getByTestId('home-prompt')).toBeFocused();
    await expect(page.getByTestId('home-design')).toHaveText('עצב לי ארון');
    await expect(page.getByTestId('home-manual')).toHaveText('הזנת מידות ידנית');
    await expect(page.getByTestId('entry-basic')).toContainText('ארון בסיסי');
    await expect(page.getByTestId('home-suggestion')).toHaveCount(3);
    await expect(page.getByText('ואינו תוכנית ייצור')).toBeVisible();
    // The editor underneath is out of reach until the customer chooses a way in.
    await expect(page.locator('.topbar')).toHaveJSProperty('inert', true);
    await expect(page.locator('.workspace')).toHaveJSProperty('inert', true);
  });

  test('without an AI connection it says so honestly, and a description still opens the designer with an honest reply', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('home-offline')).toContainText('אינו מחובר');
    await expect(page.getByTestId('home-mic')).toHaveCount(0); // voice needs the AI designer too
    await page.getByTestId('home-prompt').fill('ארון ברוחב 240 עם שלוש מגירות');
    await page.keyboard.press('Enter');
    await designerReady(page);
    await expect(page.getByTestId('home')).toBeHidden();
    const messages = page.getByTestId('chat-messages');
    await expect(messages).toContainText('ארון ברוחב 240 עם שלוש מגירות');
    await expect(messages).toContainText('לא מחובר');
    expect(await revision(page)).toBe(1); // nothing was changed without a confirmed proposal
    expect(await width(page)).toBe(2000);
  });

  test('with the AI connected, the description is the first chat message and its proposal waits for Confirm', async ({ page }) => {
    const calls = await mockAgent(page);
    await page.goto('/');
    await expect(page.getByTestId('home-offline')).toHaveCount(0);
    await page.getByTestId('home-prompt').fill('ארון ברוחב 240 לחדר שינה');
    await page.getByTestId('home-design').click();
    await expect(page.getByTestId('proposal-card')).toContainText('200.0 ס״מ ← 240.0 ס״מ');
    expect(calls).toHaveLength(1);
    expect(calls[0].messages).toEqual([{ role: 'user', text: 'ארון ברוחב 240 לחדר שינה' }]);
    expect(calls[0].language).toBe('he');
    expect(calls[0].design.dimensions.width).toBe(2000); // the agent sees the current design
    expect(await width(page)).toBe(2000); // not applied before Confirm
  });

  test('"enter dimensions manually" opens the editor with the width selected, so typing replaces it', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('home-manual').click();
    await designerReady(page);
    await expect(page.getByTestId('dim-width')).toBeFocused();
    await page.keyboard.type('230');
    await page.keyboard.press('Enter');
    await expect.poll(() => width(page)).toBe(2300);
  });

  test('an idea fills the field but sends nothing', async ({ page }) => {
    await page.goto('/');
    const idea = page.getByTestId('home-suggestion').first();
    const text = await idea.textContent();
    await idea.click();
    await expect(page.getByTestId('home-prompt')).toHaveValue(text);
    await expect(page.getByTestId('home-prompt')).toBeFocused();
    await expect(page.getByTestId('home')).toBeVisible();
  });

  test('Back, Forward and the logo move between the homepage and the designer, and the design is kept', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('home-manual').click();
    await designerReady(page);
    await page.keyboard.type('250');
    await page.keyboard.press('Enter');
    await expect.poll(() => width(page)).toBe(2500);

    await page.goBack();
    await expect(page.getByTestId('home')).toBeVisible();
    await expect(page.getByTestId('entry-basic')).toHaveText('המשך לעיצוב הנוכחי'); // a design is in progress
    await page.goForward();
    await expect(page.getByTestId('home')).toBeHidden();
    await expect(page.locator('.workspace')).toHaveJSProperty('inert', false);

    await page.getByTestId('go-home').click();
    await expect(page.getByTestId('home')).toBeVisible();
    await page.getByTestId('entry-basic').click();
    await expect(page.getByTestId('home')).toBeHidden();
    expect(await width(page)).toBe(2500); // continuing never resets the design
  });

  test('works by keyboard alone: the field, then the main action', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('home-prompt')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('home-design')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('home-manual')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('dim-width')).toBeFocused();
  });
});

test.describe('homepage errors', () => {
  test.use({ allowedConsoleErrors: [/Failed to load resource/] });

  test('when the design service cannot be reached, the page says so in Hebrew', async ({ page }) => {
    await page.route('**/api/catalog', (route) => route.abort());
    await page.goto('/');
    await expect(page.locator('#error-banner')).toHaveText('אין חיבור לשירות העיצוב. בדקו את החיבור וטענו מחדש את הדף.');
  });
});
