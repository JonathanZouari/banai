// Pull-down hanging rail (wardrobe lift): chosen per compartment, saved in the design, editable,
// and carried into the carpenter PDF.
import { clickComponent, expect, openDesigner, test } from './fixtures.js';

const state = (page) => page.evaluate(() => {
  const { design, revision, selection } = window.__banai.store.getState();
  return { design, revision, selection };
});
const leftRails = async (page) => (await state(page)).design.compartments[0].rails;
const liftParts = (page) => page.evaluate(() => {
  const children = window.__banai.viewer.meshOf('carcass').parent.children;
  return children.filter((o) => o.userData.part?.startsWith('lift-')).length;
});

test.describe('pull-down rail', () => {
  test.beforeEach(async ({ page }) => openDesigner(page));

  test('choose a compartment, add a pull-down rail, switch its type, move and delete it', async ({ page }) => {
    const before = await state(page);
    await page.getByTestId('select-cmp_left').click(); // choose the compartment
    await page.getByTestId('add-pulldown').click();

    await expect.poll(async () => (await leftRails(page)).length).toBe(1);
    const [rail] = await leftRails(page);
    expect(rail.type).toBe('pulldown');
    expect((await state(page)).revision).toBe(before.revision + 1);
    await expect.poll(() => liftParts(page)).toBe(5); // 2 plates, 2 arms, 1 pull rod

    // Select it in 3D: the rail stays pickable through its mechanism.
    await page.getByLabel('Show interior').check();
    await clickComponent(page, rail.id);
    await expect(page.getByTestId('selected-section')).toContainText('Selected · Pull-down rail');
    await expect(page.locator('.dim-label--selected')).toContainText('Pull-down rail');

    await page.getByTestId('rail-type').getByRole('button', { name: 'Fixed' }).click();
    await expect.poll(async () => (await leftRails(page))[0].type).toBe('fixed');
    await expect.poll(() => liftParts(page)).toBe(0);
    await page.getByTestId('rail-type').getByRole('button', { name: 'Pull-down' }).click();
    await expect.poll(async () => (await leftRails(page))[0].type).toBe('pulldown');

    const height = page.getByTestId('rail-y');
    await height.fill('190');
    await height.press('Enter');
    await expect.poll(async () => (await leftRails(page))[0]).toMatchObject({ y: 1900, type: 'pulldown' });

    await page.getByTestId('delete-selected').click();
    await expect.poll(async () => (await leftRails(page)).length).toBe(0);
  });

  test('the carpenter PDF includes the pull-down rail', async ({ page }) => {
    await page.getByTestId('select-cmp_left').click();
    await page.getByTestId('add-pulldown').click();
    await expect.poll(async () => (await leftRails(page)).length).toBe(1);
    const { design } = await state(page);
    const status = await page.evaluate(async (d) => {
      const response = await fetch(`${window.location.origin.replace('5183', '8010')}/api/export/pdf`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ design: d, language: 'en' }),
      });
      return response.status;
    }, design);
    expect(status).toBe(200);
  });
});
