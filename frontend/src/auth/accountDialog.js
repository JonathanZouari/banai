// Accounts PROTOTYPE: the signed-in user's dialog: who is signed in, their saved designs (newest
// first) and Sign out. A plain list, not a dashboard. Text is set via textContent only.
import { el, button } from '../editor/fields.js';
import { createDialog } from '../ui/dialog.js';

const dateFormat = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

function formatDate(iso) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : dateFormat.format(date);
}

/**
 * `account`: the controller from account.js. `listDesigns()` resolves to [{ designId, name, updatedAt }].
 * `onOpen(designId)` opens one; `onSignedOut()` runs after Sign out.
 */
export function createAccountDialog({ account, listDesigns, onOpen, onSignedOut = () => {} }) {
  const who = el('p', { className: 'dialog__text' });
  who.dataset.testid = 'account-email';
  const list = el('ul', { className: 'my-designs', attrs: { 'aria-label': 'My designs' } });
  list.dataset.testid = 'my-designs';
  const status = el('p', { className: 'dialog__status', attrs: { role: 'status' } });
  status.dataset.testid = 'account-status';

  const row = ({ designId, name, updatedAt }) => {
    const open = button('Open', () => {
      dialog.close();
      onOpen(designId);
    }, { variant: 'tonal', testId: 'my-design-open' });
    open.setAttribute('aria-label', `Open ${name}`);
    const item = el('li', { className: 'my-designs__item' }, [
      el('div', { className: 'my-designs__info' }, [
        el('span', { className: 'my-designs__name', text: name }),
        el('span', { className: 'my-designs__date', text: formatDate(updatedAt) }),
      ]),
      open,
    ]);
    item.dataset.testid = 'my-design';
    return item;
  };

  async function load() {
    list.replaceChildren();
    status.hidden = false;
    status.textContent = 'Loading your designs…';
    try {
      const designs = await listDesigns();
      list.replaceChildren(...designs.map(row));
      status.textContent = designs.length ? `${designs.length} saved ${designs.length === 1 ? 'design' : 'designs'}.`
        : 'No saved designs yet. Use Save while signed in to keep a design here.';
    } catch (error) {
      status.textContent = error?.message || 'Your designs could not be loaded.';
    }
  }

  const dialog = createDialog({
    title: 'My designs',
    labelId: 'account-dialog-title',
    testId: 'account-dialog',
    body: [who, list, status],
    actions: [
      button('Sign out', async () => {
        dialog.close();
        await account.signOut();
        onSignedOut();
      }, { variant: 'secondary', testId: 'sign-out' }),
      button('Close', () => dialog.close(), { variant: 'ghost', testId: 'account-close' }),
    ],
  });

  return {
    ...dialog,
    open: () => {
      who.textContent = `Signed in as ${account.user()?.email ?? ''}`;
      dialog.open();
      load();
    },
  };
}
