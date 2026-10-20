// The header's Share menu: copy the link, or send it by WhatsApp or email. Every item needs a saved
// design's private link, so they stay disabled (with a note saying why) until setLink() gives one.
// Saving arrives with the Supabase phase; it only has to call setLink(url) afterwards.
import { language, t } from '../i18n/strings.js';
import { attachPopover } from '../ui/menu.js';
import { mailtoUrl, safeLink, whatsappUrl } from './shareLinks.js';

const COPIED_MS = 2000;

export function createShareMenu({ trigger, panel }) {
  const copy = panel.querySelector('#share-copy');
  const whatsapp = panel.querySelector('#share-whatsapp');
  const email = panel.querySelector('#share-email');
  const note = panel.querySelector('#share-note');
  const popover = attachPopover(trigger, panel, { role: 'menu' });
  let link = null;
  let timer = null;

  const label = (button) => button.querySelector('[data-i18n]');
  const sync = () => {
    const ready = link !== null;
    [copy, whatsapp, email].forEach((button) => { button.disabled = !ready; });
    note.hidden = ready;
    panel.setAttribute('aria-label', t('uiShareAria'));
  };
  const relabel = () => {
    sync();
    if (timer === null) label(copy).textContent = t('uiCopyLink');
  };
  language.subscribe(relabel);

  const flashCopied = () => {
    label(copy).textContent = t('uiLinkCopied');
    clearTimeout(timer);
    timer = setTimeout(() => { timer = null; label(copy).textContent = t('uiCopyLink'); }, COPIED_MS);
  };

  copy.addEventListener('click', async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      flashCopied();
    } catch {
      // Clipboard blocked (permissions, insecure context): nothing to fall back on silently.
      label(copy).textContent = t('uiCopyLink');
    }
  });
  const open = (url) => { if (url) window.open(url, '_blank', 'noopener,noreferrer'); };
  whatsapp.addEventListener('click', () => open(whatsappUrl(link, t('uiShareMessage'))));
  email.addEventListener('click', () => open(mailtoUrl(link, { subject: t('uiShareMessage'), body: t('uiShareMessage') })));

  sync();
  return {
    /** Give the saved design's private link (or null to turn sharing off again). */
    setLink(next) {
      link = next === null ? null : safeLink(next);
      sync();
    },
    popover,
  };
}
