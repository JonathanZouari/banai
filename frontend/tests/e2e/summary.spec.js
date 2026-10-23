import { expect, openDesigner, test } from './fixtures.js';

// The design summary: interior and exterior views in one window, switched by a slider (tabs).
// It must follow every committed change, manual or AI, and never mention prices or manufacturing.

const ok = (data) => ({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });

/** A mocked agent whose proposal makes the wardrobe shallower (55 cm); see agent.spec.js. */
async function mockAgent(page) {
  await page.route('**/api/health', (route) => route.fulfill(ok({ status: 'ok', env: 'e2e', agent: true })));
  await page.route('**/api/chat', (route) => route.fulfill(ok({
    reply: 'Sure! Here is my proposal.',
    proposal: {
      proposalId: 'prp_0123456789abcdef', baseRevision: route.request().postDataJSON().revision, baseHash: 'a'.repeat(64),
      ops: [{ op: 'update_dimensions', depth: 550 }], signature: 'b'.repeat(64),
      summary: 'Makes the wardrobe shallower.', changes: [{ title: 'Depth', detail: '60.0 cm to 55.0 cm' }],
    },
  })));
  await page.route('**/api/proposals/apply', (route) => {
    const body = route.request().postDataJSON();
    const design = structuredClone(body.design);
    design.dimensions.depth = 550;
    return route.fulfill(ok({ design, revision: body.revision + 1 }));
  });
}

async function commit(locator, value) {
  await locator.fill(value);
  await locator.press('Enter');
}

test.describe('design summary', () => {
  test('shows the interior view by default, with counts and an honest note', async ({ page }) => {
    await openDesigner(page);
    const summary = page.getByTestId('summary-section');
    await expect(page.getByTestId('summary-tab-interior')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('summary-interior-width')).toHaveText('196.4 cm');
    await expect(page.getByTestId('summary-interior-height')).toHaveText('236.4 cm');
    await expect(page.getByTestId('summary-compartment-widths')).toHaveText('64.3 · 64.3 · 64.2 cm');
    await expect(page.getByTestId('summary-volume')).toHaveText('≈ 2,735 L');
    await expect(page.getByTestId('summary-hanging')).toHaveText('64.3 cm');
    await expect(page.getByTestId('summary-counts')).toHaveText('3 compartments · 7 shelves · 2 drawers · 1 rail');
    await expect(summary).toContainText('Not a price and not a manufacturing check.');
    await expect(summary).not.toContainText(/₪|\$|€|price:|manufacturable/i);
    await expect(page.getByTestId('summary-panel-exterior')).toHaveAttribute('inert', '');
  });

  test('the slider switches views by mouse and by arrow keys; the hidden view is inert', async ({ page }) => {
    await openDesigner(page);
    await page.getByTestId('summary-tab-exterior').click();
    await expect(page.getByTestId('summary-tab-exterior')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('summary-panel-interior')).toHaveAttribute('inert', '');
    await expect(page.getByTestId('summary-exterior-width')).toHaveText('200.0 cm');
    await expect(page.getByTestId('summary-footprint')).toHaveText('1.20 m²');
    await expect(page.getByTestId('summary-doors')).toHaveText('3 · Hinged');
    // The view window shows only the selected panel.
    await expect.poll(() => page.getByTestId('summary-panel-exterior').evaluate((panel) => {
      const viewport = panel.closest('.summary-viewport').getBoundingClientRect();
      return Math.round(panel.getBoundingClientRect().left - viewport.left);
    })).toBe(1); // inside the 1px viewport border

    await page.getByTestId('summary-tab-exterior').press('ArrowLeft');
    await expect(page.getByTestId('summary-tab-interior')).toBeFocused();
    await expect(page.getByTestId('summary-tab-interior')).toHaveAttribute('aria-selected', 'true');
    await page.getByTestId('summary-tab-interior').press('End');
    await expect(page.getByTestId('summary-tab-exterior')).toHaveAttribute('aria-selected', 'true');
    expect(await page.evaluate(() => window.__banai.store.getState().revision)).toBe(1); // UI only
  });

  test('updates right after a manual edit and keeps the chosen view', async ({ page }) => {
    await openDesigner(page);
    await page.getByTestId('summary-tab-exterior').click();
    await commit(page.getByTestId('dim-width'), '240');
    await expect(page.getByTestId('summary-exterior-width')).toHaveText('240.0 cm');
    await expect(page.getByTestId('summary-tab-exterior')).toHaveAttribute('aria-selected', 'true');
    await page.getByTestId('select-cmp_middle').click();
    await page.getByTestId('add-drawer').click();
    await expect(page.getByTestId('summary-counts')).toHaveText('3 compartments · 7 shelves · 3 drawers · 1 rail');
    await page.getByTestId('summary-tab-interior').click();
    await expect(page.getByTestId('summary-interior-width')).toHaveText('236.4 cm');
  });

  test('updates right after an AI proposal is confirmed', async ({ page }) => {
    await mockAgent(page);
    await openDesigner(page);
    await expect(page.getByTestId('summary-interior-depth')).toHaveText('60.0 cm');
    await page.getByTestId('chat-input').fill('Make it 55 cm deep');
    await page.getByTestId('chat-send').click();
    await expect(page.getByTestId('proposal-card')).toBeVisible();
    await expect(page.getByTestId('summary-interior-depth')).toHaveText('60.0 cm'); // not before Confirm
    await page.getByTestId('proposal-confirm').click();
    await expect(page.getByTestId('summary-interior-depth')).toHaveText('55.0 cm');
    await expect(page.getByTestId('summary-volume')).toHaveText('≈ 2,507 L');
  });
});
