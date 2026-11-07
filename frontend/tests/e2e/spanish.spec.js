import { expect, openDesigner, openStep, test } from './fixtures.js';

// Spanish as a third chat language. The agent is mocked at the network edge (as in agent.spec.js);
// the PDF is rendered by the real E2E backend.

const ok = (data) => ({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
const REPLIES = { he: 'אפשר! הנה ההצעה שלי.', en: 'Sure! Here is my proposal.', es: '¡Claro! Esta es mi propuesta.' };

async function mockAgent(page) {
  const calls = [];
  await page.route('**/api/health', (route) => route.fulfill(ok({ status: 'ok', env: 'e2e', agent: true, storage: true })));
  await page.route('**/api/chat', async (route) => {
    const body = route.request().postDataJSON();
    calls.push(body);
    await route.fulfill(ok({
      reply: REPLIES[body.language],
      proposal: {
        proposalId: 'prp_0123456789abcdef', baseRevision: body.revision, baseHash: 'a'.repeat(64),
        ops: [{ op: 'update_dimensions', depth: 550 }], signature: 'b'.repeat(64),
        summary: 'Menos profundo.', changes: [{ title: 'Fondo', detail: '60,0 cm a 55,0 cm' }],
      },
    }));
  });
  return calls;
}

test.describe('Spanish', () => {
  test('writing in Spanish switches the chat to Spanish, and a neutral message keeps it', async ({ page }) => {
    const calls = await mockAgent(page);
    await openDesigner(page);
    await expect(page.getByTestId('chat-language-he')).toHaveAttribute('aria-pressed', 'true');

    await page.getByTestId('chat-input').fill('Quiero el armario menos profundo, por favor');
    await page.getByTestId('chat-send').click();
    await expect(page.getByTestId('chat-language-es')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#chat-panel')).toHaveAttribute('dir', 'ltr');
    await expect(page.locator('#chat-panel')).toHaveAttribute('lang', 'es');
    await expect(page.getByTestId('chat-messages')).toContainText(REPLIES.es);
    await expect(page.getByTestId('proposal-card')).toContainText('Cambios propuestos');
    await expect(page.getByTestId('proposal-confirm')).toHaveText('Confirmar');
    expect(calls[0].language).toBe('es');

    await page.getByTestId('proposal-cancel').click();
    await page.getByTestId('chat-input').fill('55 cm');
    await page.getByTestId('chat-send').click();
    await expect(page.locator('.chat__bubble--assistant:not(.chat__typing)').last()).toHaveText(REPLIES.es);
    expect(calls[1].language).toBe('es'); // no language in "55 cm": stays Spanish

    await page.reload(); // the choice is remembered
    await page.getByTestId('entry-basic').click();
    await expect(page.getByTestId('chat-language-es')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('chat-input')).toHaveAttribute('placeholder', 'Describe tu armario…');
  });

  test('the switch offers Spanish, and the carpenter PDF can be downloaded in Spanish', async ({ page }) => {
    await openDesigner(page);
    await expect(page.getByTestId('chat-language-es')).toHaveText('ES');
    await page.getByTestId('chat-language-es').click();
    await expect(page.locator('#chat-panel')).toHaveAttribute('lang', 'es');

    await openStep(page, 'interior'); // the PDF button sits next to "+ Add compartment"
    await page.getByTestId('open-export').click();
    await expect(page.getByTestId('export-language')).toHaveValue('es'); // follows the chat language
    const request = page.waitForRequest('**/api/export/pdf');
    const download = page.waitForEvent('download');
    await page.getByTestId('export-download').click();
    expect((await request).postDataJSON().language).toBe('es');
    expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
  });
});
