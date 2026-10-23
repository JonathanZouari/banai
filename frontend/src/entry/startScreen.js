// Start screen: log in or sign up (or continue as a guest), then three ways in, one editor. Shown on load
// as a modal; choosing an option closes it. A customer who is already logged in goes straight to the choice.
import { el, button } from '../editor/fields.js';
import { createAuthForm } from '../auth/authDialog.js';
import { icon } from '../ui/icons.js';
import { createLogo } from '../ui/logo.js';
import { ENTRY_POINTS } from './entryPoints.js';

export const START_FOOTNOTE = 'Designs are illustrative previews and are not manufacturing drawings.';

export function mountStartScreen({ onChoose, session = null, getLanguage = () => 'he' }) {
  const cards = ENTRY_POINTS.map((entry) => {
    const action = el('button', { className: 'btn', attrs: { type: 'button' } }, [
      document.createTextNode(`${entry.action} `),
      icon('arrow', { size: 18 }),
    ]);
    action.dataset.testid = `entry-${entry.id}`;
    const card = el('article', { className: 'entry-card' }, [
      el('span', { className: 'entry-card__icon' }, [icon(entry.icon, { size: 24 })]),
      el('h2', { className: 'entry-card__title', text: entry.title }),
      el('p', { className: 'entry-card__text', text: entry.description }),
      action,
    ]);
    action.addEventListener('click', () => {
      dialog.close();
      dialog.remove();
      onChoose(entry);
    });
    return card;
  });

  const title = el('h1', { className: 'start__title', text: 'Design your wardrobe', attrs: { id: 'start-title' } });
  const subtitle = el('p', { className: 'start__subtitle' });
  const step = el('div', { className: 'start__step' });

  const showChoice = () => {
    title.textContent = 'Design your wardrobe';
    subtitle.textContent = 'Choose how you would like to begin. You can switch between the AI designer and manual editing at any time.';
    step.replaceChildren(el('div', { className: 'start__cards' }, cards));
    cards[0].querySelector('button').focus();
  };

  const showLogin = () => {
    const auth = createAuthForm({ session, getLanguage, onSuccess: showChoice, onModeChange: (text) => { title.textContent = text; } });
    subtitle.textContent = 'Log in or create an account to save your designs. You can also continue as a guest.';
    const guest = button('Continue as guest', showChoice, { variant: 'ghost', testId: 'auth-guest' });
    step.replaceChildren(el('div', { className: 'start__auth' }, [
      auth.form,
      el('div', { className: 'start__auth-actions' }, [auth.submit, auth.switchMode, guest]),
    ]));
    return auth;
  };

  const dialog = el('dialog', { className: 'start', attrs: { 'aria-labelledby': 'start-title' } }, [
    el('header', { className: 'start__bar' }, [createLogo({ size: 36 })]),
    el('main', { className: 'start__main' }, [
      title,
      subtitle,
      step,
      el('p', { className: 'start__footnote', text: START_FOOTNOTE }),
      el('a', { className: 'start__footnote', text: 'הצהרת נגישות', attrs: { href: '/accessibility.html', lang: 'he' } }),
    ]),
  ]);
  dialog.dataset.testid = 'start-screen';
  // A choice is required: Esc must not leave the user on a blank workspace.
  dialog.addEventListener('cancel', (event) => event.preventDefault());
  document.body.append(dialog);
  const loginFirst = session !== null && session.user() === null;
  const auth = loginFirst ? showLogin() : null;
  if (!loginFirst) showChoice();
  dialog.showModal();
  if (auth) auth.focus();
  return dialog;
}
