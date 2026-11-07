// The room photo stays in the browser (ADR-008): it is checked, decoded and shown from an object URL.
// It is never uploaded, never saved and never given to the AI, so its metadata (e.g. EXIF location)
// never leaves the customer's computer.

// ASSUMPTION: configurable defaults for what the preview accepts, not business rules.
export const PHOTO_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp']);
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_PHOTO_PIXELS = 40_000_000; // keeps decoding and display memory bounded

/** A quick check before decoding: null when acceptable, else 'type' | 'size' | 'empty'. Pure. */
export function checkPhotoFile(file) {
  if (!file || !PHOTO_TYPES.includes(file.type)) return 'type';
  if (file.size === 0) return 'empty';
  if (file.size > MAX_PHOTO_BYTES) return 'size';
  return null;
}

/**
 * Validate and decode the file. Resolves { ok: true, url, width, height } or { ok: false, reason }
 * ('type' | 'size' | 'empty' | 'broken' | 'pixels'). A broken or fake image fails to decode.
 */
export async function loadPhoto(file, { decode = globalThis.createImageBitmap, urls = URL } = {}) {
  const reason = checkPhotoFile(file);
  if (reason) return { ok: false, reason };
  let bitmap;
  try {
    bitmap = await decode(file);
  } catch {
    return { ok: false, reason: 'broken' };
  }
  const { width, height } = bitmap;
  bitmap.close?.();
  if (!width || !height) return { ok: false, reason: 'broken' };
  if (width * height > MAX_PHOTO_PIXELS) return { ok: false, reason: 'pixels' };
  return { ok: true, url: urls.createObjectURL(file), width, height };
}

/** The current photo, shared by the room panel and the room view. Replacing or removing it frees the old URL. */
export function createPhotoStore({ load = loadPhoto, urls = URL } = {}) {
  let photo = null;
  const listeners = new Set();
  const notify = () => listeners.forEach((listener) => listener(photo));
  return {
    get: () => photo,
    async set(file) {
      const result = await load(file);
      if (!result.ok) return result;
      if (photo) urls.revokeObjectURL(photo.url);
      photo = { url: result.url, width: result.width, height: result.height };
      notify();
      return result;
    },
    remove() {
      if (!photo) return;
      urls.revokeObjectURL(photo.url);
      photo = null;
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
