// Accounts PROTOTYPE: the sign-in / create-account dialog. Errors come from the server, which never
// says whether an email has an account. Text is set via textContent only.
import { el, button } from '../editor/fields.js';
import { createDialog } from '../ui/dialog.js';

const MODES = Object.freeze({
  signIn: { label: 'Sign in', submit: 'Sign in', autocomplete: 'current-password', busy: 'Signing in…' },
  signUp: { label: 'Create account', submit: 'Create account', autocomplete: 'new-password', busy: 'Creating your account…' },
});

function input({ id, type, label, autocomplete, testId }) {
  const field = el('input', { className: 'field__input', attrs: { id, type, autocomplete, required: '', spellcheck: 'false' } });
  field.dataset.testid = testId;
  return {
    field,
    node: el('div', { className: 'field' }, [el('label', { className: 'field__label', text: label, attrs: { for: id } }), field]),
  };
}

/** `account`: the controller from account.js. `onSignedIn(user)` runs after a successful sign-in. */
export function createAuthDialog({ account, onSignedIn = () => {} }) {
  let mode = 'signIn';
  const email = input({ id: 'auth-email', type: 'email', label: 'Email', autocomplete: 'email', testId: 'auth-email' });
  const password = input({ id: 'auth-password', type: 'password', label: 'Password', autocomplete: MODES.signIn.autocomplete, testId: 'auth-password' });
  const hint = el('p', { className: 'dialog__note', text: 'At least 8 characters.', attrs: { id: 'auth-password-hint' } });
  password.field.setAttribute('aria-describedby', hint.id);
  const status = el('p', { className: 'dialog__status', attrs: { role: 'status' } });
  status.dataset.testid = 'auth-status';
  status.hidden = true;

  const tabs = el('div', { className: 'segmented auth-modes', attrs: { role: 'group', 'aria-label': 'Account' } });
  const tabButtons = Object.entries(MODES).map(([key, { label }]) => {
    const tab = el('button', { className: 'segmented__option', text: label, attrs: { type: 'button' } });
    tab.dataset.testid = `auth-mode-${key}`;
    tab.addEventListener('click', () => setMode(key));
    tabs.append(tab);
    return [key, tab];
  });

  const say = (text) => {
    status.textContent = text;
    status.hidden = !text;
  };

  const submit = button(MODES.signIn.submit, () => send(), { variant: 'primary', testId: 'auth-submit' });

  function setMode(next) {
    mode = next;
    tabButtons.forEach(([key, tab]) => tab.setAttribute('aria-pressed', String(key === mode)));
    submit.textContent = MODES[mode].submit;
    password.field.setAttribute('autocomplete', MODES[mode].autocomplete);
    hint.hidden = mode !== 'signUp';
    say('');
  }

  async function send() {
    if (submit.disabled) return;
    if (!email.field.value.trim() || !password.field.value) {
      say('Enter your email and password.');
      return;
    }
    submit.disabled = true;
    say(MODES[mode].busy);
    try {
      if (mode === 'signUp') {
        const { confirmationRequired } = await account.signUp(email.field.value, password.field.value);
        if (confirmationRequired) {
          setMode('signIn');
          say('Check your email to confirm the account, then sign in.');
          return;
        }
      } else {
        await account.signIn(email.field.value, password.field.value);
      }
      password.field.value = '';
      say('');
      dialog.close();
      onSignedIn(account.user());
    } catch (error) {
      say(error?.message || 'Something went wrong. Please try again.');
    } finally {
      submit.disabled = false;
    }
  }

  [email.field, password.field].forEach((field) => field.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      send();
    }
  }));

  const dialog = createDialog({
    title: 'Your BanAI account',
    labelId: 'auth-dialog-title',
    testId: 'auth-dialog',
    body: [
      tabs,
      el('p', { className: 'dialog__text', text: 'Sign in to keep your designs in one place. You can still save and share without an account.' }),
      email.node,
      password.node,
      hint,
      status,
    ],
    actions: [button('Close', () => dialog.close(), { variant: 'ghost', testId: 'auth-close' }), submit],
  });
  setMode('signIn');

  return {
    ...dialog,
    open: (startMode = 'signIn') => {
      setMode(startMode);
      dialog.open();
      email.field.focus();
    },
  };
}
