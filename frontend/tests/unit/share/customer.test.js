// Customer details (share/customer.js, ADR-038): checked as typed, mirrored by the server, kept with the project.
import { describe, expect, it } from 'vitest';
import { checkCustomer, sameCustomer, storedCustomer } from '../../../src/share/customer.js';
import { createProjectStore, projectFile, readProjectFile } from '../../../src/share/projects.js';

const DANA = { name: 'דנה לוי', phone: '052-1234567', email: 'dana@example.com', city: 'חיפה', floor: 4, elevator: false, installDate: '2026-11-20' };

describe('checking the details', () => {
  it('keeps only filled fields, cleaned; nothing filled is none', () => {
    expect(checkCustomer({ name: '  דנה\u202e   לוי ', phone: '', floor: '', elevator: null })).toEqual({ ok: true, customer: { name: 'דנה לוי' } });
    expect(checkCustomer({})).toEqual({ ok: true, customer: null });
    expect(checkCustomer({ ...DANA, floor: '4', notes: 'שורה\nשנייה' }).customer).toMatchObject({ floor: 4, notes: 'שורה שנייה', elevator: false });
  });

  it('refuses what the server would, and says which field', () => {
    expect(checkCustomer({ phone: 'call me' })).toMatchObject({ ok: false, field: 'phone' });
    expect(checkCustomer({ email: 'dana@' })).toMatchObject({ ok: false, field: 'email' });
    expect(checkCustomer({ floor: '2.5' })).toMatchObject({ ok: false, field: 'floor' });
    expect(checkCustomer({ floor: '151' })).toMatchObject({ ok: false, field: 'floor' });
    expect(checkCustomer({ installDate: '2026-02-30' })).toMatchObject({ ok: false, field: 'installDate' });
    expect(checkCustomer({ installDate: '0000-01-01' })).toMatchObject({ ok: false, field: 'installDate' });
    expect(checkCustomer({ installDate: '2101-01-01' })).toMatchObject({ ok: false, field: 'installDate' });
    expect(checkCustomer({ name: 'ע'.repeat(61) })).toMatchObject({ ok: false, field: 'name' });
    expect(checkCustomer({ name: '😀'.repeat(60) }).ok).toBe(true); // characters, not UTF-16 units
  });

  it('stored details must still pass, with no foreign keys', () => {
    expect(storedCustomer(DANA)).toEqual(DANA);
    expect(storedCustomer({ ...DANA, ssn: '1' })).toBeNull();
    expect(storedCustomer({ email: 'bad' })).toBeNull();
    expect(storedCustomer('x')).toBeNull();
    expect(sameCustomer(null, undefined)).toBe(true);
    expect(sameCustomer(DANA, { ...DANA })).toBe(true);
  });
});

describe('details with the project', () => {
  const memory = () => {
    const data = {};
    return { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = String(v); } };
  };

  it('are saved and opened with it, and travel in the project file', () => {
    const projects = createProjectStore({ storage: memory(), newId: () => 'project-0001' });
    projects.save({ name: 'חדר שינה', design: { a: 1 }, customer: DANA });
    expect(projects.entry('project-0001')).toEqual({ design: { a: 1 }, customer: DANA, remote: null });
    projects.save({ id: 'project-0001', name: 'חדר שינה', design: { a: 1 } });
    expect(projects.entry('project-0001').customer).toBeNull();
    expect(projects.entry('missing')).toBeNull();
    const file = projectFile({ name: 'x', design: { a: 1 }, customer: DANA });
    expect(readProjectFile(file).customer).toEqual(DANA);
    expect(JSON.parse(projectFile({ name: 'x', design: { a: 1 } }))).not.toHaveProperty('customer');
    const tampered = JSON.stringify({ ...JSON.parse(file), customer: { ...DANA, email: 'nope' } });
    expect(readProjectFile(tampered)).toMatchObject({ ok: true, customer: null });
  });
});
