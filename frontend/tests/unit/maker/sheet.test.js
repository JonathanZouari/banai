// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { frontElevationSvg, sideSectionSvg } from '../../../src/maker/drawing.js';
import { buildSheet } from '../../../src/maker/sheet.js';
import { DISCLAIMER } from '../../../src/maker/standards.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const catalog = loadCatalog();
const basic = loadDesign('basic');

describe('drawings', () => {
  it('draws the front to scale with overall dimensions, one rect per shelf and the door swings', () => {
    const svg = frontElevationSvg(basic);
    const [, , viewWidth, viewHeight] = svg.getAttribute('viewBox').split(' ').map(Number);
    expect(viewWidth).toBeGreaterThan(2000); // the wardrobe in mm plus margins: drawn to scale
    expect(viewHeight).toBeGreaterThan(2400);
    expect(svg.textContent).toContain('200.0 ס"מ');
    expect(svg.textContent).toContain('240.0 ס"מ');
    expect(svg.querySelectorAll('.shelf')).toHaveLength(7);
    expect(svg.querySelectorAll('.drawer')).toHaveLength(2);
    expect(svg.querySelectorAll('.rail')).toHaveLength(1);
    expect(svg.querySelectorAll('.partition')).toHaveLength(2);
    expect(svg.querySelectorAll('.door-swing')).toHaveLength(3);
    expect(svg.textContent).toContain('43.6'); // shelf top 400 + 18 + 18 panel, from the floor
  });

  it('draws the side section with System 32 hole rows and the recommended plinth', () => {
    const svg = sideSectionSvg(basic);
    expect(svg.textContent).toContain('60.0 ס"מ');
    expect(svg.textContent).toContain('37 / 32');
    expect(svg.querySelectorAll('.hole').length).toBeGreaterThan(100);
    expect(svg.querySelector('.plinth')).not.toBeNull();
  });

  it('never parses design text as markup', () => {
    const svg = frontElevationSvg(basic);
    expect(svg.querySelector('script')).toBeNull();
  });
});

describe('buildSheet', () => {
  const pages = buildSheet({ design: basic, catalog, reference: 'BANAI-TEST-1', date: new Date('2026-10-18T10:00:00Z'), snapshot: 'data:image/jpeg;base64,AAAA' });

  it('builds three Hebrew right-to-left A4 pages', () => {
    expect(pages).toHaveLength(3);
    pages.forEach((page, i) => {
      expect(page.getAttribute('dir')).toBe('rtl');
      expect(page.getAttribute('lang')).toBe('he');
      expect(page.textContent).toContain(`עמוד ${i + 1} מתוך 3`);
    });
  });

  it('puts the disclaimer on the first and last pages and never claims compliance', () => {
    expect(pages[0].textContent).toContain(DISCLAIMER);
    expect(pages[2].textContent).toContain(DISCLAIMER);
    const all = pages.map((p) => p.textContent).join(' ');
    expect(all).not.toMatch(/עומד בתקן|מאושר לייצור|תואם לתקן/);
  });

  it('contains the summary, drawings, snapshot, cut list, hardware, checks and sources', () => {
    expect(pages[0].textContent).toContain('BANAI-TEST-1');
    expect(pages[0].textContent).toContain('רוחב 200.0 × גובה 240.0 × עומק 60.0');
    expect(pages[0].querySelector('svg')).not.toBeNull();
    expect(pages[0].querySelector('img').getAttribute('src')).toBe('data:image/jpeg;base64,AAAA');
    expect(pages[1].querySelectorAll('table')).toHaveLength(2);
    expect(pages[1].textContent).toContain('דופן צד');
    expect(pages[1].textContent).toContain('ציר נסתר');
    expect(pages[2].querySelectorAll('.maker-check').length).toBeGreaterThan(3);
    expect(pages[2].textContent).toContain('System 32');
    expect(pages[2].textContent).toContain('ת"י 1142');
  });
});
