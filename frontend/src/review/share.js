// Sending the design to the carpenter from the customer's own email or WhatsApp. Nothing is sent by
// the app: these are links the customer opens, with the private design link in the message. Pure, so
// the encoding is unit-tested.

/** { mailto, whatsapp } hrefs for `link`, using the UI strings `s` (review section). */
export function shareLinks(link, s) {
  const message = s.message(link);
  return {
    mailto: `mailto:?subject=${encodeURIComponent(s.emailSubject)}&body=${encodeURIComponent(message)}`,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(message)}`,
  };
}

/** Only links the app made itself are shared (a #d= private link on this origin). */
export function isShareableLink(link, origin = globalThis.location?.origin) {
  try {
    const url = new URL(link);
    return url.origin === origin && /^#d=[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/.test(url.hash);
  } catch {
    return false;
  }
}
