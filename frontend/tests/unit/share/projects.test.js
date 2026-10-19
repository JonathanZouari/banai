import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NAME, MAX_PROJECTS, PROJECTS_KEY, cleanName, createProjectStore, fileName, projectFile, readProjectFile,
} from '../../../src/share/projects.js';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => { data[key] = String(value); },
  };
}

const design = (width) => ({ dimensions: { width } });

function store(storage = memoryStorage()) {
  let clock = 0;
  let id = 0;
  return createProjectStore({
    storage,
    now: () => new Date(Date.UTC(2026, 9, 19, 10, 0, clock++)).toISOString(),
    newId: () => `project-${String(++id).padStart(4, '0')}`,
  });
}

describe('projects in this browser', () => {
  it('saves, lists newest first, opens and overwrites by id', () => {
    const projects = store();
    const first = projects.save({ name: 'חדר שינה', design: design(2000) });
    const second = projects.save({ name: '  ארון   ילדים ', design: design(1200) });
    expect(first).toMatchObject({ ok: true, name: 'חדר שינה' });
    expect(second.name).toBe('ארון ילדים');
    expect(projects.list().map((p) => p.name)).toEqual(['ארון ילדים', 'חדר שינה']);
    expect(projects.get(first.id)).toEqual(design(2000));
    projects.save({ id: first.id, name: 'חדר שינה', design: design(2400) });
    expect(projects.list()).toHaveLength(2);
    expect(projects.get(first.id)).toEqual(design(2400));
    projects.remove(second.id);
    expect(projects.list().map((p) => p.id)).toEqual([first.id]);
  });

  it('refuses a 31st project and reports blocked storage, never throwing', () => {
    const projects = store();
    for (let i = 0; i < MAX_PROJECTS; i += 1) expect(projects.save({ name: `p${i}`, design: design(1000) }).ok).toBe(true);
    expect(projects.save({ name: 'one more', design: design(1000) })).toEqual({ ok: false, reason: 'full' });
    const blocked = createProjectStore({ storage: { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } } });
    expect(blocked.list()).toEqual([]);
    expect(blocked.save({ name: 'x', design: design(1) })).toEqual({ ok: false, reason: 'storage' });
  });

  it('ignores damaged or hand-edited storage', () => {
    expect(store(memoryStorage({ [PROJECTS_KEY]: '{not json' })).list()).toEqual([]);
    const odd = JSON.stringify([{ id: '../x', name: 'a', savedAt: 'x', design: {} }, { id: 'abcdefgh1', name: 3 }, 'x',
      { id: 'goodgood1', name: 'ok', savedAt: '2026-10-19', design: { a: 1 } }]);
    expect(store(memoryStorage({ [PROJECTS_KEY]: odd })).list().map((p) => p.id)).toEqual(['goodgood1']);
  });

  it('cleans names: no control or direction characters, at most 60, never empty', () => {
    expect(cleanName('a\u202eb\u0007c')).toBe('abc');
    expect(cleanName('   ')).toBe(DEFAULT_NAME);
    expect(cleanName('x'.repeat(80))).toHaveLength(60);
  });

  it('a project file round-trips; anything else is refused', () => {
    const text = projectFile({ name: 'חדר שינה', design: design(2000) });
    expect(readProjectFile(text)).toEqual({ ok: true, name: 'חדר שינה', design: design(2000) });
    expect(readProjectFile('{"app":"other","version":1,"design":{}}')).toEqual({ ok: false, reason: 'format' });
    expect(readProjectFile('not json')).toEqual({ ok: false, reason: 'format' });
    expect(readProjectFile('x'.repeat(1024 * 1024 + 1))).toEqual({ ok: false, reason: 'size' });
    expect(fileName('a/b:c?')).toBe('abc.banai.json');
  });
});
