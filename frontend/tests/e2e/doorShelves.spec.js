import { clickComponent, expect, openDesigner, selection, test } from './fixtures.js';

const doorShelves = (page, doorId) => page.evaluate(
  (id) => window.__banai.store.getState().design.doors.items.find((d) => d.id === id).shelves, doorId,
);
const doorsOpen = (page) => page.evaluate(() => !window.__banai.store.getState().ui.doorsVisible);

test.describe('Door shelves', () => {
  test.beforeEach(async ({ page }) => openDesigner(page));

  test('add a door shelf from the door panel; it opens the doors, can be edited, picked in 3D and deleted', async ({ page }) => {
    await clickComponent(page, 'dr_left');
    await expect(page.getByTestId('door-shelves')).toContainText('No shelves on this door yet');

    await page.getByTestId('add-door-shelf').click();
    await expect.poll(async () => (await doorShelves(page, 'dr_left')).length).toBe(1);
    const [added] = await doorShelves(page, 'dr_left');
    await expect.poll(() => selection(page)).toEqual({ id: added.id, kind: 'doorShelf' });
    await expect.poll(() => doorsOpen(page)).toBe(true);
    await expect(page.getByTestId('selected-section')).toContainText('Shelf 1');

    await page.getByTestId('door-shelf-y').fill('120');
    await page.getByTestId('door-shelf-y').press('Enter');
    await page.getByTestId('door-shelf-depth-choice').getByRole('button', { name: '8 cm' }).click();
    await expect.poll(async () => (await doorShelves(page, 'dr_left'))[0]).toMatchObject({ y: 1200, depth: 80 });
    await expect(page.locator('.dim-label--selected')).toHaveText('Door 1 shelf · 120.0 cm from base · 8.0 cm deep');

    // The shelf swung open with its door and can be picked in the 3D view.
    await page.getByRole('button', { name: 'Deselect' }).click();
    await clickComponent(page, added.id);
    await expect.poll(() => selection(page)).toEqual({ id: added.id, kind: 'doorShelf' });

    await page.getByTestId('door-shelf-parent').click();
    await expect.poll(() => selection(page)).toEqual({ id: 'dr_left', kind: 'door' });
    await page.getByTestId(`delete-door-shelf-${added.id}`).click();
    await expect.poll(async () => (await doorShelves(page, 'dr_left')).length).toBe(0);
  });

  test('a quick layout adds its shelves at once; the elevation selects one; overlap shows a friendly error', async ({ page }) => {
    await page.getByTestId('part-dr_middle').click();
    await page.getByTestId('door-layout-even3').click();
    await expect.poll(async () => (await doorShelves(page, 'dr_middle')).length).toBe(3);
    await expect(page.getByTestId('door-layout-even3')).toBeDisabled();

    const [first, second] = await doorShelves(page, 'dr_middle');
    await page.getByTestId(`elevation-${first.id}`).focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => selection(page)).toEqual({ id: first.id, kind: 'doorShelf' });

    await page.getByTestId('door-shelf-y').fill(String((second.y + 5) / 10));
    await page.getByTestId('door-shelf-y').press('Enter');
    await expect(page.getByText("Door shelves can't overlap. Choose a different height.")).toBeVisible();
    expect((await doorShelves(page, 'dr_middle'))[0].y).toBe(first.y);
  });

  test('door shelves are nested under their door in All parts and survive a hinge change', async ({ page }) => {
    await page.getByTestId('part-dr_right').click();
    await page.getByTestId('door-layout-topBottom').click();
    await expect(page.getByRole('button', { name: 'Door 3 › Shelf 2' })).toBeVisible();
    await page.getByTestId('hinge-side').getByRole('button', { name: 'Right' }).click();
    await expect.poll(async () => (await doorShelves(page, 'dr_right')).length).toBe(2);
  });
});
