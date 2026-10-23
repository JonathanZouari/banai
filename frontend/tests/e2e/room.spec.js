import { test, expect, openDesigner } from './fixtures.js';

// Room elements: the ceiling at three points, the niche at three heights and the free floor in front of the
// wardrobe. The smallest reading governs; R21 (room to open) and R22 (out of square) follow; the room is
// drawn in pencil in 3D. Advisories advise only: the design changes only through a fix the customer taps.
const advice = (page, id) => page.getByTestId(`advice-${id}`);
const store = (page) => page.evaluate(() => window.__banai.store.getState());

async function fill(page, testId, value) {
  const field = page.getByTestId(testId);
  await field.fill(value);
  await field.press('Enter');
}

test.describe('room elements', () => {
  test.beforeEach(async ({ page }) => {
    await openDesigner(page, { advice: true });
  });

  test('three readings: the smallest governs, and an out-of-square niche is explained', async ({ page }) => {
    for (const [i, v] of ['260', '257', '259'].entries()) await fill(page, `site-height-${i}`, v);
    for (const [i, v] of ['210', '206', '208'].entries()) await fill(page, `site-width-${i}`, v);
    const { site } = (await store(page)).design;
    expect(site).toMatchObject({ heights: [2600, 2570, 2590], ceiling: 2570, widths: [2100, 2060, 2080], niche: 2060 });
    await expect(page.getByTestId('site-heights')).toContainText('קובע: 257.0 ס״מ');
    await expect(advice(page, 'r22-walls')).toContainText('הנישה לא ישרה: הפרש של 40 מ״מ');
    await expect(advice(page, 'r22-ceiling')).toContainText('התקרה לא ישרה: הפרש של 30 מ״מ');
    // The left reading sits on the left, also in the RTL panel.
    const [left, right] = await Promise.all(['site-height-0', 'site-height-2'].map((id) => page.getByTestId(id).boundingBox()));
    expect(left.x).toBeLessThan(right.x);
    // Clearing one reading keeps the others, and the next smallest governs.
    await fill(page, 'site-height-1', '');
    expect((await store(page)).design.site).toMatchObject({ heights: [2600, null, 2590], ceiling: 2590 });
  });

  test('too little room to open the doors: R21 warns, draws the room, and its fix splits the doors', async ({ page }) => {
    await fill(page, 'site-clearance', '60');
    await expect(advice(page, 'r21-swing')).toContainText('אין מקום לפתוח את הדלת');
    await expect(page.locator('.room-label')).toHaveText('מרחב פנוי 60.0 ס״מ');
    const before = (await store(page)).design;
    expect(before.doors.items).toHaveLength(3); // the advisory changed nothing by itself
    await page.getByTestId('advice-fix-r21-swing').click();
    await expect(advice(page, 'r21-swing')).toHaveCount(0);
    expect((await store(page)).design.doors.items.length).toBeGreaterThan(3);
    await fill(page, 'site-clearance', '');
    await expect(page.locator('.room-label')).toHaveCount(0);
    expect((await store(page)).design.site).toBeNull();
  });
});
