import { test, expect, openDesigner, openChat } from './fixtures.js';

// ADR-036: Bob may search the web for carpentry facts. The pages a reply cites are listed under it as plain
// links that open in a new tab; a source the browser cannot trust (not http or https) is never shown.
const STORAGE_KEY = 'banai.openaiApiKey';
const KEY = 'sk-test-e2eKey0123456789abcdefWXYZ';
const envelope = (data) => ({
  status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
  body: JSON.stringify({ success: true, data, error: null }),
});

test('the sources of a reply are listed under it as safe links', async ({ page }) => {
  await page.route('**/api/settings/ai/verify', (r) => r.fulfill(envelope({ status: 'connected', model: 'm', maskedKey: 'sk-...WXYZ', checkedAt: 'x' })));
  await page.route('**/api/chat', (route) => route.fulfill(envelope({
    reply: 'ציר עם בולם נסגר בשקט. לפי היצרן הוא מחזיק דלת עד 20 ק״ג.',
    model: 'gpt-test-mini',
    sources: [
      { title: 'Blum: hinges for heavy doors', url: 'https://www.blum.com/hinges' },
      { title: '<img src=x onerror=alert(1)>', url: 'https://example.org/a' },
      { title: 'bad', url: 'javascript:alert(1)' },
    ],
  })));
  await page.addInitScript(([name, key]) => localStorage.setItem(name, key), [STORAGE_KEY, KEY]);
  await openDesigner(page);
  await openChat(page);
  await page.getByTestId('chat-input').fill('איזה ציר מתאים לדלת כבדה?');
  await page.getByTestId('chat-send').click();

  const bubble = page.getByTestId('chat-bubble-assistant');
  await expect(bubble).toContainText('ציר עם בולם');
  const links = bubble.getByTestId('chat-sources').locator('a');
  await expect(links).toHaveCount(2);
  await expect(links.first()).toHaveText('Blum: hinges for heavy doors');
  await expect(links.first()).toHaveAttribute('href', 'https://www.blum.com/hinges');
  await expect(links.first()).toHaveAttribute('target', '_blank');
  await expect(links.first()).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(links.nth(1)).toHaveText('<img src=x onerror=alert(1)>'); // text, never HTML
  await expect(bubble.locator('img')).toHaveCount(0);
  await expect(bubble.getByTestId('chat-sources')).toContainText('blum.com');
});
