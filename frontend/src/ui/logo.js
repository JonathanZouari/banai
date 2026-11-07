// BanAI logo: the brand artwork (wardrobe mark + "BanAI" wordmark) as a bundled image.
// Vite serves it from our own origin, so the CSP stays 'self'. The source file is
// "BanAI logo.png" in the Obsidian vault; the web sizes in ../assets are cropped from it.
import logoUrl from '../assets/banai-logo.png';
import markUrl from '../assets/banai-mark.png';

const LOGO_RATIO = 393 / 160; // width / height of banai-logo.png

function image(src, { height, width, className }) {
  const img = document.createElement('img');
  img.src = src;
  img.alt = 'BanAI';
  img.className = className;
  img.height = height;
  img.width = width;
  img.decoding = 'async';
  return img;
}

/** The wardrobe mark alone (square). */
export function createLogoMark({ size = 36 } = {}) {
  return image(markUrl, { height: size, width: size, className: 'logo__mark' });
}

/** The full logo. `size` is the mark size it replaces; `tagline` is optional text next to it. */
export function createLogo({ size = 36, tagline = '' } = {}) {
  const height = Math.round(size * 1.25);
  const root = document.createElement('span');
  root.className = 'logo';
  root.append(image(logoUrl, { height, width: Math.round(height * LOGO_RATIO), className: 'logo__img' }));
  if (tagline) {
    const note = document.createElement('span');
    note.className = 'logo__tagline';
    note.textContent = tagline;
    root.append(note);
  }
  return root;
}
