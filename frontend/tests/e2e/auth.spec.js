import { test, expect, openDesigner, openDesignerLoggedIn } from './fixtures.js';

// Accounts live in the E2E backend's memory. The start screen asks for a login before the designer.
test.describe('accounts', () => {
  test('sign up returns to Log in; logging in opens the designer; Log out returns to the login', async ({ page }) => {
    const { email } = await openDesignerLoggedIn(page);
    await expect(page.getByTestId('auth-user')).toHaveText(email);
    await expect(page.getByTestId('open-auth')).toHaveText('Log out');

    await page.getByTestId('open-auth').click();
    const start = page.getByTestId('start-screen');
    await expect(start.getByTestId('auth-email')).toBeVisible();
    await expect(start.getByTestId('auth-submit')).toHaveText('Log in');
  });

  test('a returning customer skips the login after a reload', async ({ page }) => {
    await openDesignerLoggedIn(page);
    await page.reload();
    const start = page.getByTestId('start-screen');
    await expect(start.getByTestId('entry-basic')).toBeVisible();
    await expect(start.getByTestId('auth-email')).toHaveCount(0);
  });

  test('a logged-in customer can save', async ({ page }) => {
    await openDesignerLoggedIn(page);
    await page.getByTestId('open-save').click();
    await expect(page.getByTestId('save-confirm')).toHaveText('Save design');
    await page.getByTestId('save-confirm').click();
    await expect(page.getByTestId('share-link')).toHaveValue(/#d=/);
  });

  test('a guest is asked to log in to save', async ({ page }) => {
    await openDesigner(page);
    await expect(page.getByTestId('open-auth')).toHaveText('Log in');
    await page.getByTestId('open-save').click();
    await expect(page.getByTestId('save-confirm')).toHaveText('Log in to save');
    await page.getByTestId('save-confirm').click();
    await expect(page.getByTestId('auth-dialog')).toBeVisible();
  });

  test.describe('refusals', () => {
    test.use({ allowedConsoleErrors: [/401/, /409/] });

    test('a wrong password and a taken email are refused with a message', async ({ page, context }) => {
      const { email } = await openDesignerLoggedIn(page);
      const other = await context.browser().newPage(); // a fresh browser profile: logged out
      await other.goto(page.url().split('#')[0]);
      const start = other.getByTestId('start-screen');
      await start.getByTestId('auth-email').fill(email);
      await start.getByTestId('auth-password').fill('not-the-password');
      await start.getByTestId('auth-submit').click();
      await expect(start.getByTestId('auth-status')).toContainText('שגויים');

      await start.getByTestId('auth-switch').click();
      await start.getByTestId('auth-email').fill(email);
      await start.getByTestId('auth-password').fill('e2e-password-1');
      await start.getByTestId('auth-submit').click();
      await expect(start.getByTestId('auth-status')).toContainText('כבר קיים');
      await other.close();
    });
  });
});
