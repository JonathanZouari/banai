import { test, expect, openDesigner } from './fixtures.js';

// Accounts PROTOTYPE (branch feature/auth). The E2E backend has no Supabase keys, so accounts and
// saved designs live in its in-memory stores.
const PASSWORD = 'correct horse 42';
const uniqueEmail = (name) => `${name}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

async function signUp(page, email) {
  await page.getByTestId('open-account').click();
  await page.getByTestId('auth-mode-signUp').click();
  await page.getByTestId('auth-email').fill(email);
  await page.getByTestId('auth-password').fill(PASSWORD);
  await page.getByTestId('auth-submit').click();
  await expect(page.getByTestId('auth-dialog')).not.toBeVisible();
  await expect(page.getByTestId('open-account')).toHaveText(email);
}

const setHeight = (page, height) => page.evaluate(
  (value) => window.__banai.store.dispatch([{ op: 'update_dimensions', height: value }]).ok,
  height,
);

async function save(page) {
  await page.getByTestId('open-save').click();
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-status')).toContainText('Saved');
  await page.getByTestId('save-close').click();
}

test.describe('accounts prototype', () => {
  test('sign up, save to the account, and reopen it from My designs', async ({ page }) => {
    const email = uniqueEmail('dana');
    await openDesigner(page);
    await expect(page.getByTestId('open-account')).toHaveText('Sign in');
    await signUp(page, email);

    expect(await setHeight(page, 2300)).toBe(true);
    await save(page);
    await expect(page).toHaveURL(/#d=[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/); // still a shareable private link

    await page.goto('/');
    await page.getByTestId('entry-basic').click();
    await expect(page.getByTestId('open-account')).toHaveText(email); // the reload stayed signed in
    await page.getByTestId('open-account').click();
    await expect(page.getByTestId('account-email')).toHaveText(`Signed in as ${email}`);
    await expect(page.getByTestId('my-design')).toHaveCount(1);
    await page.getByTestId('my-design-open').click();

    await expect(page).toHaveURL(/#my=[0-9a-f-]{36}$/);
    await page.waitForFunction(() => window.__banai?.viewer.meshOf('shf_l1'));
    await expect(page.getByTestId('start-screen')).toHaveCount(0);
    expect(await page.evaluate(() => window.__banai.store.getState().design.dimensions.height)).toBe(2300);

    // Saving again writes over the same account design.
    expect(await setHeight(page, 2200)).toBe(true);
    await save(page);
    await page.getByTestId('open-account').click();
    await expect(page.getByTestId('my-design')).toHaveCount(1);
  });

  test.describe('refusals', () => {
    // One pattern: Playwright reads a two-element array as [value, options].
    test.use({ allowedConsoleErrors: [/40[14]/] });

    test('a wrong password is refused without saying whether the email exists', async ({ page }) => {
      const email = uniqueEmail('eli');
      await openDesigner(page);
      await signUp(page, email);
      await page.getByTestId('open-account').click();
      await page.getByTestId('sign-out').click();
      await expect(page.getByTestId('open-account')).toHaveText('Sign in');

      await page.getByTestId('open-account').click();
      await page.getByTestId('auth-email').fill(email);
      await page.getByTestId('auth-password').fill('wrong password');
      await page.getByTestId('auth-submit').click();
      await expect(page.getByTestId('auth-status')).toContainText('האימייל או הסיסמה שגויים');

      await page.getByTestId('auth-password').fill(PASSWORD);
      await page.getByTestId('auth-password').press('Enter');
      await expect(page.getByTestId('open-account')).toHaveText(email);
    });

    test("another user's design does not open and is not listed", async ({ page, context }) => {
      await openDesigner(page);
      await signUp(page, uniqueEmail('owner'));
      await save(page);
      await page.getByTestId('open-account').click();
      await page.getByTestId('my-design-open').click();
      await expect(page).toHaveURL(/#my=/);
      const ownerLink = page.url();
      await page.waitForFunction(() => window.__banai?.viewer.meshOf('shf_l1'));
      await page.getByTestId('open-account').click();
      await page.getByTestId('sign-out').click();

      await signUp(page, uniqueEmail('other'));
      await page.getByTestId('open-account').click();
      await expect(page.getByTestId('account-status')).toContainText('No saved designs yet');
      await page.getByTestId('account-close').click();

      const other = await context.newPage();
      await other.goto(ownerLink);
      await expect(other.locator('#error-banner')).toContainText('Sign in with the account that saved this design');
      await expect(other.getByTestId('start-screen')).toBeVisible();
    });
  });
});
