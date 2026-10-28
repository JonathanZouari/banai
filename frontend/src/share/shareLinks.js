// Builds the outgoing share URLs (WhatsApp, email). Pure and DOM-free so it is unit-testable.
// Only an http(s) link to this app's own origin is accepted, so nothing else can be smuggled into a message.

/** The link as a normalised string, or null when it is not an http(s) link to `origin`. */
export function safeLink(link, origin = globalThis.location?.origin) {
  try {
    const url = new URL(String(link ?? ''));
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (url.origin !== origin) return null;
    return url.href;
  } catch {
    return null;
  }
}

/** https://wa.me/?text=<message and link>, or null for an unsafe link. */
export function whatsappUrl(link, message, origin) {
  const safe = safeLink(link, origin);
  if (!safe) return null;
  return `https://wa.me/?text=${encodeURIComponent(`${message} ${safe}`.trim())}`;
}

/** mailto:?subject=…&body=…, or null for an unsafe link. */
export function mailtoUrl(link, { subject, body }, origin) {
  const safe = safeLink(link, origin);
  if (!safe) return null;
  const text = `${body ? `${body}\n\n` : ''}${safe}`;
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
}
