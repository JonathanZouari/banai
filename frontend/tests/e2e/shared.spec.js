import { test, expect, openDesigner } from './fixtures.js';

// Projects kept on the server and shared by a link (ADR-042). The E2E server keeps them in memory.
const LINK = /#d=[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/;
const state = (page) => page.evaluate(() => window.__banai.store.getState());
const widen = (page, width) => page.evaluate((w) => window.__banai.store.dispatch([{ op: 'update_dimensions', width: w }]), width);

/** A link that opens nothing leaves its reason in the projects dialog's status (the toast is too brief to read on a slow page). */
const deadLinkReason = (page) => expect(page.getByTestId('project-status')).toContainText('כבר לא קיים בשרת');

async function otherBrowser(page) {
  const context = await page.context().browser().newContext({ baseURL: test.info().project.use.baseURL, viewport: { width: 1440, height: 900 } });
  return { context, other: await context.newPage() };
}

test('a project is saved on the server, opens from its link in another browser, and saves again', async ({ page, allowConsoleErrors }) => {
  test.setTimeout(120_000);
  allowConsoleErrors(/status of 40[49]/);
  await openDesigner(page);
  await page.evaluate(() => window.__banai.projects.setCustomer({ name: 'דנה לוי', city: 'ירושלים' }));
  await widen(page, 1900);

  await page.getByTestId('open-save').click();
  await page.getByTestId('project-name').fill('חדר של דנה');
  await page.getByTestId('share-save').click();
  await expect(page.getByTestId('share-status')).toContainText('נשמר בשרת');
  await expect(page.getByTestId('share-status')).toContainText('פרטי הלקוח'); // told the details go with it
  const link = await page.getByTestId('share-link').inputValue();
  expect(link).toMatch(LINK);
  await expect(page.getByTestId('share-save')).toHaveText('עדכון בשרת');
  await expect(page.getByTestId('project-item')).toHaveCount(1); // the local list keeps it too
  await page.getByTestId('save-close').click();

  // Another browser: the link opens the project, with its customer, and skips the start screen.
  const { context, other } = await otherBrowser(page);
  await other.goto(link);
  await other.waitForFunction(() => window.__banai?.projects.getCustomer()?.name === 'דנה לוי');
  expect((await other.evaluate(() => window.__banai.store.getState().design.dimensions.width))).toBe(1900);
  await expect(other.getByTestId('entry-basic')).toHaveCount(0);

  // It saves from there, and the first browser is now behind: its save is refused, never overwriting.
  await widen(other, 1800);
  await other.getByTestId('open-save').click();
  await other.getByTestId('share-save').click();
  await expect(other.getByTestId('share-status')).toContainText('נשמר בשרת');

  await widen(page, 1700);
  await page.getByTestId('open-save').click();
  await page.getByTestId('share-save').click();
  await expect(page.getByTestId('share-status')).toContainText('נשמר ממקום אחר');
  await expect(page.getByTestId('share-save-new')).toBeVisible();
  await page.getByTestId('share-save-new').click();
  await expect(page.getByTestId('share-status')).toContainText('נשמר בשרת');
  expect(await page.getByTestId('share-link').inputValue()).not.toBe(link); // a new project, a new link
  expect((await state(page)).design.dimensions.width).toBe(1700);
  await context.close();
});

test('the token travels in a header, never in a request address', async ({ page }) => {
  const urls = [];
  page.on('request', (request) => urls.push(request.url()));
  await openDesigner(page);
  await page.getByTestId('open-save').click();
  await page.getByTestId('share-save').click();
  await expect(page.getByTestId('share-status')).toContainText('נשמר בשרת');
  const token = (await page.getByTestId('share-link').inputValue()).split('.').pop();
  expect(urls.some((url) => url.includes(token))).toBe(false);
});

test('deleting from the server stops the link, and a dead link falls back to the start screen', async ({ page, allowConsoleErrors }) => {
  allowConsoleErrors(/status of 40[49]/);
  await openDesigner(page);
  await page.getByTestId('open-save').click();
  await page.getByTestId('share-save').click();
  await expect(page.getByTestId('share-link')).toHaveValue(LINK); // the save has answered: the link is there to copy
  const link = await page.getByTestId('share-link').inputValue();
  await page.getByTestId('share-delete').click();
  await page.getByTestId('share-delete-confirm').click();
  await expect(page.getByTestId('share-status')).toContainText('נמחק מהשרת');
  await expect(page.getByTestId('share-link')).toBeHidden();
  await expect(page.getByTestId('project-item')).toHaveCount(1); // still in this browser

  // The deleted project's link no longer opens anything (a reload of the same browser: a second one boots slowly here).
  await page.goto('about:blank');
  await page.goto(link);
  await deadLinkReason(page);
  await expect(page.getByTestId('entry-basic')).toBeVisible();
});

test('a link with a wrong token opens nothing and says nothing about the project', async ({ page, allowConsoleErrors }) => {
  allowConsoleErrors(/status of 404/);
  await page.goto(`/#d=6f1c0d7e-1111-4222-8333-444455556666.${'A'.repeat(43)}`);
  await expect(page.getByTestId('entry-basic')).toBeVisible();
  await deadLinkReason(page);
});
