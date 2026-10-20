import { test, expect, openDesigner, chooseSetting } from './fixtures.js';

const doors = (page) => page.evaluate(() => window.__banai.store.getState().design.doors);
const viewerKinds = (page) => page.evaluate(() => {
  const meshes = window.__banai.viewer.meshOf('dr_left').parent.children;
  return meshes.filter((m) => m.userData.kind === 'mirror').map((m) => m.userData.componentId);
});
const handleStyles = (page) => page.evaluate(() => window.__banai.viewer.meshOf('dr_left').parent.children
  .filter((m) => m.userData.part === 'handle').map((m) => m.userData.style));

test.describe('handles and mirror fronts', () => {
  test('one handle style and finish for every door, including no handles', async ({ page }) => {
    await openDesigner(page);
    await expect(page.getByTestId('handle-style-bar')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('handle-style-knob').click();
    await page.getByTestId('handle-finish-brushed_steel').click();
    expect((await doors(page)).handles).toEqual({ style: 'knob', finish: 'brushed_steel' });
    await expect.poll(() => handleStyles(page)).toEqual(['knob', 'knob', 'knob']);
    await page.getByTestId('handle-style-none').click();
    await expect.poll(() => handleStyles(page)).toEqual([]);
    await expect(page.getByTestId('handle-finish-brass')).toBeDisabled();
  });

  test('mirror fronts on chosen hinged doors, from the chips and from a selected door', async ({ page }) => {
    await openDesigner(page);
    await page.getByTestId('mirror-dr_middle').click();
    await expect(page.getByTestId('mirror-dr_middle')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => viewerKinds(page)).toEqual(['dr_middle']);
    await page.evaluate(() => window.__banai.store.select('dr_right'));
    await page.getByTestId('door-front').getByRole('button', { name: 'Mirror' }).click();
    expect((await doors(page)).items.map((d) => d.front)).toEqual(['panel', 'mirror', 'mirror']);
    await expect(page.locator('.dim-label--selected')).toContainText('mirror');
    await page.getByTestId('mirror-dr_middle').click();
    expect((await doors(page)).items.map((d) => d.front)).toEqual(['panel', 'panel', 'mirror']);
  });

  test('mirror fronts on sliding doors survive a panel-count change', async ({ page }) => {
    await openDesigner(page);
    await page.getByTestId('door-type').getByRole('button', { name: 'Sliding' }).click();
    const [first, second] = (await doors(page)).items.map((d) => d.id);
    await page.getByTestId(`mirror-${second}`).click();
    await page.getByTestId('sliding-count').fill('3');
    await page.getByTestId('sliding-count').press('Enter');
    await expect.poll(async () => (await doors(page)).items.length).toBe(3);
    const items = (await doors(page)).items;
    expect(items.slice(0, 2).map((d) => d.id)).toEqual([first, second]);
    expect(items.map((d) => d.front)).toEqual(['panel', 'mirror', 'panel']);
    await expect(page.getByTestId('mirror-fronts').getByRole('button')).toHaveCount(3);
  });

  test('the section hides with no doors and speaks Hebrew', async ({ page }) => {
    await openDesigner(page);
    await chooseSetting(page, 'lang-he');
    await expect(page.getByTestId('doors-section')).toContainText('ידיות ומראות');
    await expect(page.getByTestId('handle-style-knob')).toContainText('כפתור');
    await expect(page.getByTestId('mirror-dr_left')).toHaveText('דלת 1');
    await page.evaluate(() => window.__banai.store.dispatch([{ op: 'configure_doors', type: 'none' }]));
    await expect(page.getByTestId('doors-section')).toHaveCount(0);
  });

  test('one undo reverts a mirror front', async ({ page }) => {
    await openDesigner(page);
    await page.getByTestId('mirror-dr_left').click();
    await page.getByTestId('undo').click();
    expect((await doors(page)).items[0].front).toBe('panel');
  });
});
