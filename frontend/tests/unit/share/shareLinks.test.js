import { describe, expect, it } from 'vitest';
import { mailtoUrl, safeLink, whatsappUrl } from '../../../src/share/shareLinks.js';

const ORIGIN = 'https://banai.example';
const LINK = 'https://banai.example/#d=7b1c.token_abc-123';

describe('safeLink', () => {
  it('accepts an http(s) link to the app origin', () => {
    expect(safeLink(LINK, ORIGIN)).toBe(LINK);
    expect(safeLink('http://localhost:5173/#d=x.y', 'http://localhost:5173')).toBe('http://localhost:5173/#d=x.y');
  });

  it.each([
    ['another origin', 'https://evil.example/#d=x.y'],
    ['a javascript: URL', 'javascript:alert(1)'],
    ['a data: URL', 'data:text/html,<script>1</script>'],
    ['a look-alike host', 'https://banai.example.evil.example/'],
    ['not a URL', 'hello'],
    ['empty', ''],
    ['null', null],
  ])('rejects %s', (_name, link) => {
    expect(safeLink(link, ORIGIN)).toBeNull();
  });
});

describe('whatsappUrl', () => {
  it('puts the message and link in one encoded text parameter', () => {
    const url = whatsappUrl(LINK, 'My wardrobe & more', ORIGIN);
    expect(url.startsWith('https://wa.me/?text=')).toBe(true);
    expect(decodeURIComponent(url.slice('https://wa.me/?text='.length))).toBe(`My wardrobe & more ${LINK}`);
    expect(url).not.toContain(' ');
  });

  it('returns null for an unsafe link', () => {
    expect(whatsappUrl('https://evil.example/', 'hi', ORIGIN)).toBeNull();
  });
});

describe('mailtoUrl', () => {
  it('encodes subject and body', () => {
    const url = mailtoUrl(LINK, { subject: 'Design & plan', body: 'Look\nhere' }, ORIGIN);
    const query = new URLSearchParams(url.slice('mailto:?'.length));
    expect(url.startsWith('mailto:?subject=')).toBe(true);
    expect(query.get('subject')).toBe('Design & plan');
    expect(query.get('body')).toBe(`Look\nhere\n\n${LINK}`);
  });

  it('returns null for an unsafe link', () => {
    expect(mailtoUrl('javascript:alert(1)', { subject: 's', body: 'b' }, ORIGIN)).toBeNull();
  });
});
