// Log in / Sign up: one form with two modes, used on the start screen and in a dialog from the top bar.
// The server's message is shown as it is.
import { el, button } from '../editor/fields.js';
import { createDialog } from '../ui/dialog.js';

const MODES = {
  login: { title: 'Log in', submit: 'Log in', switchText: 'New here? Create an account', autocomplete: 'current-password' },
  signup: { title: 'Create an account', submit: 'Sign up', switchText: 'Already have an account? Log in', autocomplete: 'new-password' },
};

let formCount = 0;

function field({ id, label, type, autocomplete, testId, hint }) {
  const input = el('input', { className: 'field__input', attrs: { id, type, autocomplete, required: '', spellcheck: 'false' } });
  input.dataset.testid = testId;
  const children = [el('label', { className: 'field__label', text: label, attrs: { for: id } }), input];
  if (hint) {
    const note = el('p', { className: 'dialog__note', text: hint, attrs: { id: `${id}-hint` } });
    input.setAttribute('aria-describedby', note.id);
    children.push(note);
  }
  return { input, node: el('div', { className: 'field' }, children) };
}

/**
 * The form and its buttons. `session`: from createSession(). `getLanguage()`: the UI language for server
 * messages. `onSuccess()` runs after a login or a sign-up that started a session. `onModeChange(title)`
 * lets the host show the current mode's title.
 */
export function createAuthForm({ session, getLanguage, onSuccess = () => {}, onModeChange = () => {} }) {
  formCount += 1;
  const prefix = formCount === 1 ? 'auth' : `auth${formCount}`; // unique ids when two forms exist
  let mode = 'login';
  const email = field({ id: `${prefix}-email`, label: 'Email', type: 'email', autocomplete: 'email', testId: 'auth-email' });
  const password = field({
    id: `${prefix}-password`, label: 'Password', type: 'password', autocomplete: 'current-password', testId: 'auth-password',
    hint: '8 to 72 characters.',
  });
  const status = el('p', { className: 'dialog__status', attrs: { role: 'status' } });
  status.dataset.testid = 'auth-status';

  const submit = button('', () => form.requestSubmit(), { variant: 'primary', testId: 'auth-submit' });
  const switchMode = button('', () => setMode(mode === 'login' ? 'signup' : 'login'), { variant: 'ghost', testId: 'auth-switch' });

  const form = el('form', { className: 'auth-form', attrs: { novalidate: '' } }, [email.node, password.node, status]);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = { email: email.input.value.trim(), password: password.input.value, language: getLanguage() };
    if (!values.email || !values.password) {
      status.textContent = 'Enter your email and password.';
      return;
    }
    submit.disabled = true;
    status.textContent = mode === 'login' ? 'Logging in…' : 'Creating your account…';
    try {
      if (mode === 'signup') {
        // Back to Log in with the email filled in: the customer logs in with the new account.
        const { confirmationRequired } = await session.signUp(values);
        password.input.value = '';
        status.textContent = confirmationRequired
          ? 'Account created. Confirm your email, then log in.'
          : 'Account created. Log in with your email and password.';
        setMode('login', { keepStatus: true });
        password.input.focus();
        return;
      }
      await session.logIn(values);
      password.input.value = '';
      status.textContent = '';
      onSuccess();
    } catch (error) {
      status.textContent = error?.message || 'Something went wrong. Please try again.';
    } finally {
      submit.disabled = false;
    }
  });

  function setMode(next, { keepStatus = false } = {}) {
    mode = next;
    submit.textContent = MODES[mode].submit;
    switchMode.textContent = MODES[mode].switchText;
    password.input.setAttribute('autocomplete', MODES[mode].autocomplete);
    if (!keepStatus) status.textContent = '';
    onModeChange(MODES[mode].title);
  }
  setMode('login');

  return { form, submit, switchMode, setMode, focus: () => email.input.focus() };
}

/** The top bar's dialog around the same form. */
export function createAuthDialog({ session, getLanguage, onSuccess = () => {} }) {
  let heading = null;
  const auth = createAuthForm({
    session, getLanguage,
    onSuccess: () => { dialog.close(); onSuccess(); },
    onModeChange: (title) => { if (heading) heading.textContent = title; },
  });
  const dialog = createDialog({
    title: MODES.login.title,
    labelId: 'auth-dialog-title',
    testId: 'auth-dialog',
    body: [auth.form],
    actions: [auth.switchMode, auth.submit, button('Close', () => dialog.close(), { variant: 'ghost', testId: 'auth-close' })],
  });
  heading = dialog.element.querySelector('.dialog__title');

  return {
    element: dialog.element,
    open(nextMode = 'login') {
      auth.setMode(nextMode);
      dialog.open();
      auth.focus();
    },
    close: dialog.close,
  };
}
