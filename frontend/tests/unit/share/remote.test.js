import { describe, expect, it, vi } from 'vitest';
import { createProjectStore } from '../../../src/share/projects.js';
import {
  createRemote, deleteRemote, openRemote, parseShareHash, saveRemote, shareHash, storedRemote,
} from '../../../src/share/remote.js';

const ID = '6f1c0d7e-1111-4222-8333-444455556666';
const TOKEN = 'A'.repeat(43);
const reply = (body, ok = true, status = ok ? 200 : 400) => vi.fn(async () => ({ ok, status, json: async () => body }));

describe('share links', () => {
  it('reads #d=<id>.<token> and nothing else', () => {
    expect(parseShareHash(`#d=${ID}.${TOKEN}`)).toEqual({ id: ID, token: TOKEN });
    expect(shareHash({ id: ID, token: TOKEN })).toBe(`#d=${ID}.${TOKEN}`);
    for (const bad of ['', '#', '#d=', `#d=${ID}`, `#d=${ID}.short`, `#d=not-a-uuid.${TOKEN}`, `#x=${ID}.${TOKEN}`, `#d=${ID}.${TOKEN}.more`, null, undefined]) {
      expect(parseShareHash(bad)).toBeNull();
    }
  });

  it('keeps a remote reference only when id, token and revision are all valid', () => {
    expect(storedRemote({ id: ID, token: TOKEN, revision: 3 })).toEqual({ id: ID, token: TOKEN, revision: 3 });
    for (const bad of [null, 'x', {}, { id: ID, token: TOKEN }, { id: ID, token: TOKEN, revision: 0 }, { id: ID, token: TOKEN, revision: 1.5 }, { id: 'x', token: TOKEN, revision: 1 }, { id: ID, token: 'short', revision: 1 }]) {
      expect(storedRemote(bad)).toBeNull();
    }
  });
});

describe('the server calls', () => {
  it('creates a project: the details go in the body, the token comes back', async () => {
    const fetchImpl = reply({ success: true, data: { id: ID, token: TOKEN, revision: 1 } });
    expect(await createRemote({ name: 'n', design: { a: 1 }, customer: { name: 'x' } }, fetchImpl)).toEqual({ id: ID, token: TOKEN, revision: 1 });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toMatch(/\/api\/projects$/);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ name: 'n', design: { a: 1 }, customer: { name: 'x' } });
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('leaves the customer out when there is none', async () => {
    const fetchImpl = reply({ success: true, data: {} });
    await createRemote({ name: 'n', design: {}, customer: null }, fetchImpl);
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ name: 'n', design: {} });
  });

  it('opens with the token in a header, never in the URL', async () => {
    const fetchImpl = reply({ success: true, data: { id: ID, name: 'n', design: {}, customer: null, revision: 2 } });
    expect((await openRemote({ id: ID, token: TOKEN }, fetchImpl)).revision).toBe(2);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toMatch(new RegExp(`/api/projects/${ID}$`));
    expect(url).not.toContain(TOKEN);
    expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(init.cache).toBe('no-store');
  });

  it('saves over a revision with If-Match, and a stale save carries its code', async () => {
    const ok = reply({ success: true, data: { revision: 4 } });
    expect(await saveRemote({ id: ID, token: TOKEN, revision: 3 }, { name: 'n', design: {} }, ok)).toEqual({ revision: 4 });
    expect(ok.mock.calls[0][1].method).toBe('PUT');
    expect(ok.mock.calls[0][1].headers['If-Match']).toBe('3');
    const stale = reply({ success: false, error: { code: 'STALE', message: 'moved on' } }, false, 409);
    await expect(saveRemote({ id: ID, token: TOKEN, revision: 3 }, { name: 'n', design: {} }, stale)).rejects.toMatchObject({ code: 'STALE' });
  });

  it('deletes with the token', async () => {
    const fetchImpl = reply({ success: true, data: { deleted: true } });
    await deleteRemote({ id: ID, token: TOKEN }, fetchImpl);
    expect(fetchImpl.mock.calls[0][1].method).toBe('DELETE');
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('turns an unreadable answer into a REQUEST_FAILED error', async () => {
    const broken = vi.fn(async () => ({ ok: false, status: 502, json: async () => { throw new Error('html'); } }));
    await expect(openRemote({ id: ID, token: TOKEN }, broken)).rejects.toMatchObject({ code: 'REQUEST_FAILED' });
  });
});

describe('a local project remembers its place on the server', () => {
  const memory = () => {
    const data = new Map();
    return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
  };

  it('keeps a valid reference and drops a damaged one', () => {
    const projects = createProjectStore({ storage: memory(), newId: () => 'project-0001' });
    projects.save({ name: 'a', design: { a: 1 }, remote: { id: ID, token: TOKEN, revision: 2 } });
    expect(projects.entry('project-0001').remote).toEqual({ id: ID, token: TOKEN, revision: 2 });
    projects.save({ id: 'project-0001', name: 'a', design: { a: 1 }, remote: { id: ID, token: 'short', revision: 2 } });
    expect(projects.entry('project-0001').remote).toBeNull();
  });
});
