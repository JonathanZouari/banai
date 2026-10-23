import { expect, openDesigner, test } from './fixtures.js';

// The design summary card follows the committed design: manual edits, confirmed AI proposals and
// designs reopened from a saved link. The agent's network edge is mocked, as in agent.spec.js.

const ok = (data) => ({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
const card = (page) => page.getByTestId('design-summary');
const value = (page, key) => page.getByTestId(`summary-${key}`);

// The basic wardrobe: 3 compartments (1928 mm inner), interior height 2364, depth 600, one rail in the middle (643).
const BASIC = { compartments: '3', shelves: '7', drawers: '2', rails: '1', interiorVolumeMm3: '2,735 L', hangingLengthMm: '64.3 cm' };

async function expectValues(page, expected) {
  for (const [key, text] of Object.entries(expected)) await expect(value(page, key)).toHaveText(text);
}

test.describe('design summary card', () => {
  test('shows the basic wardrobe as a labelled description list, with no announcement on load', async ({ page }) => {
    await openDesigner(page);
    await expect(card(page).getByRole('heading', { name: 'Design summary' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Design summary' })).toBeVisible();
    await expect(card(page).locator('dl dt')).toHaveText(['Compartments', 'Shelves', 'Drawers', 'Hanging rails', 'Interior volume', 'Hanging length']);
    await expectValues(page, BASIC);
    await expect(card(page)).toContainText('Not a manufacturing calculation.');
    await expect(card(page)).not.toContainText(/price|₪|\$|€/i);
    await expect(page.getByTestId('summary-status')).toHaveText('');
  });

  test('a manual edit updates it and is announced politely; changing it back restores it', async ({ page }) => {
    await openDesigner(page);
    await page.getByTestId('select-cmp_middle').click();
    await page.waitForTimeout(700); // a selection alone is not news
    await expect(page.getByTestId('summary-status')).toHaveText('');

    await page.getByTestId('add-rail').click();
    await expectValues(page, { rails: '2', hangingLengthMm: '128.6 cm' }); // double hanging counts twice
    await expect(page.getByTestId('summary-status')).toHaveText('Design summary: Hanging rails 2, Hanging length 128.6 cm.');
    await expect(page.getByTestId('summary-status')).toHaveAttribute('role', 'status');

    const added = await page.evaluate(() => window.__banai.store.getState().design.compartments[1].rails[1].id);
    await page.getByTestId(`part-${added}`).click();
    await page.getByTestId('delete-selected').click();
    await expectValues(page, BASIC);
    await expect(page.getByTestId('summary-status')).toHaveText('Design summary: Hanging rails 1, Hanging length 64.3 cm.');
  });

  test('a confirmed AI proposal updates it; a pending one does not', async ({ page }) => {
    await page.route('**/api/health', (route) => route.fulfill(ok({ status: 'ok', env: 'e2e', agent: true })));
    await page.route('**/api/chat', (route) => {
      const body = route.request().postDataJSON();
      return route.fulfill(ok({
        reply: 'Sure! Here is my proposal.',
        proposal: {
          proposalId: 'prp_0123456789abcdef', baseRevision: body.revision, baseHash: 'a'.repeat(64),
          ops: [{ op: 'update_dimensions', depth: 550 }], signature: 'b'.repeat(64),
          summary: 'Makes the wardrobe shallower.', changes: [{ title: 'Depth', detail: '60.0 cm to 55.0 cm' }],
        },
      }));
    });
    await page.route('**/api/proposals/apply', (route) => {
      const body = route.request().postDataJSON();
      const design = structuredClone(body.design);
      design.dimensions.depth = 550;
      return route.fulfill(ok({ design, revision: body.revision + 1 }));
    });
    await openDesigner(page);

    await page.getByTestId('chat-input').fill('Make it 55 cm deep');
    await page.getByTestId('chat-send').click();
    await expect(page.getByTestId('proposal-card')).toBeVisible();
    await expect(value(page, 'interiorVolumeMm3')).toHaveText('2,735 L'); // nothing applied yet

    await page.getByTestId('proposal-confirm').click();
    await expect(value(page, 'interiorVolumeMm3')).toHaveText('2,507 L'); // 1928 × 2364 × 550 mm³
    await expect(page.getByTestId('summary-status')).toHaveText('Design summary: Interior volume 2,507 L.');
  });

  test('a design reopened from a saved link shows its own totals', async ({ page, context }) => {
    await openDesigner(page);
    expect(await page.evaluate(() => window.__banai.store.dispatch([{ op: 'update_dimensions', height: 2300 }]).ok)).toBe(true);
    await page.getByTestId('open-save').click();
    await page.getByTestId('save-confirm').click();
    const link = await page.getByTestId('share-link').inputValue();

    const reopened = await context.newPage();
    await reopened.goto(link);
    await reopened.waitForFunction(() => window.__banai?.viewer.meshOf('shf_l1'));
    await expectValues(reopened, { ...BASIC, interiorVolumeMm3: '2,619 L' }); // 1928 × 2264 × 600 mm³
    await expect(reopened.getByTestId('summary-status')).toHaveText('');
  });
});
