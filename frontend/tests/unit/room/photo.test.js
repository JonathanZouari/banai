import { describe, expect, it, vi } from 'vitest';
import { checkPhotoFile, createPhotoStore, loadPhoto, MAX_PHOTO_BYTES } from '../../../src/room/photo.js';

const file = (type, size) => ({ type, size });
const fakeUrls = () => {
  let n = 0;
  return { createObjectURL: vi.fn(() => `blob:photo-${(n += 1)}`), revokeObjectURL: vi.fn() };
};

describe('checkPhotoFile', () => {
  it('accepts JPEG, PNG and WebP up to 10 MB', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) expect(checkPhotoFile(file(type, 1000))).toBeNull();
    expect(checkPhotoFile(file('image/png', MAX_PHOTO_BYTES))).toBeNull();
  });

  it('rejects other types, empty files and files over the limit', () => {
    expect(checkPhotoFile(file('image/gif', 10))).toBe('type');
    expect(checkPhotoFile(file('image/svg+xml', 10))).toBe('type'); // SVG can carry script
    expect(checkPhotoFile(file('text/plain', 10))).toBe('type');
    expect(checkPhotoFile(undefined)).toBe('type');
    expect(checkPhotoFile(file('image/png', 0))).toBe('empty');
    expect(checkPhotoFile(file('image/png', MAX_PHOTO_BYTES + 1))).toBe('size');
  });
});

describe('loadPhoto', () => {
  it('decodes the image and only then creates a local object URL', async () => {
    const urls = fakeUrls();
    const close = vi.fn();
    const result = await loadPhoto(file('image/png', 100), { decode: async () => ({ width: 900, height: 600, close }), urls });
    expect(result).toEqual({ ok: true, url: 'blob:photo-1', width: 900, height: 600 });
    expect(close).toHaveBeenCalled();
  });

  it('reports a broken file without creating a URL', async () => {
    const urls = fakeUrls();
    const result = await loadPhoto(file('image/png', 100), { decode: async () => { throw new Error('bad'); }, urls });
    expect(result).toEqual({ ok: false, reason: 'broken' });
    expect(urls.createObjectURL).not.toHaveBeenCalled();
  });

  it('rejects images too large to show, and never decodes a rejected type', async () => {
    const decode = vi.fn(async () => ({ width: 10000, height: 5000 }));
    expect(await loadPhoto(file('image/jpeg', 100), { decode, urls: fakeUrls() })).toEqual({ ok: false, reason: 'pixels' });
    decode.mockClear();
    expect(await loadPhoto(file('text/html', 100), { decode, urls: fakeUrls() })).toEqual({ ok: false, reason: 'type' });
    expect(decode).not.toHaveBeenCalled();
  });
});

describe('createPhotoStore', () => {
  it('replacing or removing the photo frees the previous object URL', async () => {
    const urls = fakeUrls();
    let n = 0;
    const store = createPhotoStore({ load: async () => ({ ok: true, url: `blob:${(n += 1)}`, width: 1, height: 1 }), urls });
    const seen = [];
    store.subscribe((photo) => seen.push(photo?.url ?? null));
    await store.set(file('image/png', 1));
    await store.set(file('image/png', 1));
    expect(urls.revokeObjectURL).toHaveBeenCalledWith('blob:1');
    store.remove();
    expect(urls.revokeObjectURL).toHaveBeenCalledWith('blob:2');
    expect(store.get()).toBeNull();
    expect(seen).toEqual(['blob:1', 'blob:2', null]);
  });

  it('a failed load keeps the current photo', async () => {
    const store = createPhotoStore({ load: async () => ({ ok: false, reason: 'broken' }), urls: fakeUrls() });
    expect(await store.set(file('image/png', 1))).toEqual({ ok: false, reason: 'broken' });
    expect(store.get()).toBeNull();
  });
});
