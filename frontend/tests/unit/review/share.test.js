import { afterEach, describe, expect, it, vi } from 'vitest';
import { isShareableLink, shareLinks } from '../../../src/review/share.js';
import { exportPdf, updateSavedDesign } from '../../../src/api/client.js';
import { UI_STRINGS } from '../../../src/ui/strings.js';

const ORIGIN = 'http://localhost:5173';
const LINK = `${ORIGIN}/#d=0b6f2a52-3c1e-4c8e-9a51-1f6f3f2b7d10.${'A'.repeat(43)}`;

describe('share links (opened by the customer; the app sends nothing)', () => {
  it('builds an email and a WhatsApp link with the private link, fully encoded', () => {
    const { mailto, whatsapp } = shareLinks(LINK, UI_STRINGS.he.review);
    expect(mailto.startsWith('mailto:?subject=')).toBe(true);
    expect(whatsapp.startsWith('https://wa.me/?text=')).toBe(true);
    const body = decodeURIComponent(mailto.split('&body=')[1]);
    expect(body).toContain(LINK);
    expect(decodeURIComponent(whatsapp.split('?text=')[1])).toContain(LINK);
    expect(mailto).not.toMatch(/[\s#]/); // the link's # and the spaces are encoded
    expect(whatsapp).not.toMatch(/[\s#]/);
  });

  it('works in English too', () => {
    const { mailto } = shareLinks(LINK, UI_STRINGS.en.review);
    expect(decodeURIComponent(mailto)).toContain('Wardrobe design from BanAI');
  });

  it('only shares a private link the app made, on this origin', () => {
    expect(isShareableLink(LINK, ORIGIN)).toBe(true);
    expect(isShareableLink(`${ORIGIN}/`, ORIGIN)).toBe(false);
    expect(isShareableLink('https://evil.example/#d=0b6f2a52-3c1e-4c8e-9a51-1f6f3f2b7d10.' + 'A'.repeat(43), ORIGIN)).toBe(false);
    expect(isShareableLink(`${ORIGIN}/#d=not-a-link`, ORIGIN)).toBe(false);
    expect(isShareableLink('javascript:alert(1)', ORIGIN)).toBe(false);
    expect(isShareableLink('', ORIGIN)).toBe(false);
  });
});

describe('the customer request travels with saves and the PDF', () => {
  afterEach(() => vi.restoreAllMocks());
  const request = { notes: 'ידיות שחורות', room: { width: 2500, height: null, depth: null, obstacles: ['window'], obstacleNotes: '', style: '' } };

  it('is sent with a save over a link, and left out when there is none', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: { revision: 3 } }) });
    await updateSavedDesign({ designId: 'id', token: 't', revision: 2, design: { a: 1 }, language: 'he', request }, fetchImpl);
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ design: { a: 1 }, language: 'he', request });
    await updateSavedDesign({ designId: 'id', token: 't', revision: 3, design: { a: 1 }, language: 'he' }, fetchImpl);
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).toEqual({ design: { a: 1 }, language: 'he' });
  });

  it('is sent with the PDF export, and never contains a photo', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, headers: new Headers({ 'Content-Type': 'application/pdf' }), blob: async () => new Blob(['%PDF']) });
    await exportPdf({ design: { a: 1 }, language: 'he', request }, fetchImpl);
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body).toEqual({ design: { a: 1 }, language: 'he', request });
    expect(JSON.stringify(body)).not.toMatch(/blob:|data:image/);
  });
});
