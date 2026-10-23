import { describe, expect, it, vi } from 'vitest';
import { createAccount } from '../../../src/auth/account.js';
import { parseMyHash, myHash } from '../../../src/share/link.js';

const user = { id: 'u1', email: 'dana@example.com' };
const session = (n, expiresIn = 3600) => ({ user, accessToken: `access-${n}`, refreshToken: `refresh-${n}`, expiresIn });

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => { data[key] = value; },
    removeItem: (key) => { delete data[key]; },
  };
}

const unauthorized = () => Object.assign(new Error('Please sign in again.'), { status: 401 });

function setup({ api = {}, storage = memoryStorage(), now = () => 0 } = {}) {
  const calls = {
    signUp: vi.fn(async () => session(1)),
    signIn: vi.fn(async () => session(1)),
    refreshSession: vi.fn(async () => session(2)),
    signOut: vi.fn(async () => ({})),
    ...api,
  };
  return { calls, storage, account: createAccount({ api: calls, getLanguage: () => 'en', storage, now }) };
}

describe('account session', () => {
  it('signs in, tells subscribers and keeps only the refresh token in storage', async () => {
    const { account, storage } = setup();
    const seen = [];
    account.subscribe((u) => seen.push(u));
    await account.signIn('dana@example.com', 'secret123');
    expect(account.user()).toEqual(user);
    expect(seen).toEqual([user]);
    const stored = JSON.parse(storage.data['banai.account']);
    expect(stored).toEqual({ refreshToken: 'refresh-1', user });
    expect(JSON.stringify(stored)).not.toContain('access-1');
  });

  it('sign-up that needs email confirmation does not sign in', async () => {
    const { account } = setup({ api: { signUp: vi.fn(async () => ({ confirmationRequired: true })) } });
    expect(await account.signUp('a@b.co', 'secret123')).toEqual({ confirmationRequired: true });
    expect(account.user()).toBeNull();
  });

  it('restores a stored session through a refresh, and stores the rotated token', async () => {
    const storage = memoryStorage({ 'banai.account': JSON.stringify({ refreshToken: 'refresh-0', user }) });
    const { account, calls } = setup({ storage });
    expect(await account.restore()).toEqual(user);
    expect(calls.refreshSession).toHaveBeenCalledWith({ refreshToken: 'refresh-0', language: 'en' });
    expect(JSON.parse(storage.data['banai.account']).refreshToken).toBe('refresh-2');
  });

  it('a rejected stored token clears the session without throwing', async () => {
    const storage = memoryStorage({ 'banai.account': JSON.stringify({ refreshToken: 'old', user }) });
    const { account } = setup({ storage, api: { refreshSession: vi.fn(async () => { throw unauthorized(); }) } });
    expect(await account.restore()).toBeNull();
    expect(storage.data['banai.account']).toBeUndefined();
  });

  it('a network failure on restore keeps the stored token for next time', async () => {
    const storage = memoryStorage({ 'banai.account': JSON.stringify({ refreshToken: 'keep', user }) });
    const { account } = setup({ storage, api: { refreshSession: vi.fn(async () => { throw Object.assign(new Error('offline'), { status: 0 }); }) } });
    expect(await account.restore()).toBeNull();
    expect(JSON.parse(storage.data['banai.account']).refreshToken).toBe('keep');
  });

  it('ignores corrupt storage', async () => {
    const { account, calls } = setup({ storage: memoryStorage({ 'banai.account': '{not json' }) });
    expect(await account.restore()).toBeNull();
    expect(calls.refreshSession).not.toHaveBeenCalled();
  });

  it('withToken refreshes an access token that is about to expire', async () => {
    let time = 0;
    const { account, calls } = setup({ now: () => time });
    await account.signIn('a@b.co', 'secret123');
    time = 3600 * 1000 - 30_000; // 30 s left
    const call = vi.fn(async (token) => token);
    expect(await account.withToken(call)).toBe('access-2');
    expect(calls.refreshSession).toHaveBeenCalledTimes(1);
  });

  it('withToken retries once after a 401, then signs out if the refresh fails', async () => {
    const { account } = setup({ api: { refreshSession: vi.fn(async () => { throw unauthorized(); }) } });
    await account.signIn('a@b.co', 'secret123');
    const call = vi.fn(async () => { throw unauthorized(); });
    await expect(account.withToken(call)).rejects.toMatchObject({ status: 401 });
    expect(call).toHaveBeenCalledTimes(1);
    expect(account.user()).toBeNull();
  });

  it('withToken retries with the new token after a successful refresh', async () => {
    const { account } = setup();
    await account.signIn('a@b.co', 'secret123');
    const call = vi.fn(async (token) => {
      if (token === 'access-1') throw unauthorized();
      return token;
    });
    expect(await account.withToken(call)).toBe('access-2');
  });

  it('only one refresh runs at a time', async () => {
    let time = 0;
    const { account, calls } = setup({ now: () => time });
    await account.signIn('a@b.co', 'secret123');
    time = 3600 * 1000;
    await Promise.all([account.withToken(async (t) => t), account.withToken(async (t) => t)]);
    expect(calls.refreshSession).toHaveBeenCalledTimes(1);
  });

  it('sign out ends the local session even when the server call fails', async () => {
    const { account, storage, calls } = setup({ api: { signOut: vi.fn(async () => { throw new Error('offline'); }) } });
    await account.signIn('a@b.co', 'secret123');
    await account.signOut();
    expect(account.user()).toBeNull();
    expect(storage.data['banai.account']).toBeUndefined();
    expect(calls.signOut).toHaveBeenCalledWith({ accessToken: 'access-1', language: 'en' });
  });

  it('withToken without a session is a 401', async () => {
    const { account } = setup();
    await expect(account.withToken(async () => 'x')).rejects.toMatchObject({ status: 401 });
  });
});

describe('account design link', () => {
  const designId = '0b6f2a52-3c1e-4c8e-9a51-1f6f3f2b7d10';

  it('round-trips a design id', () => {
    expect(parseMyHash(myHash({ designId }))).toEqual({ designId });
  });

  it.each(['', '#my=', '#my=not-a-uuid', `#my=${designId}.extra`, `#d=${designId}`, `#my=${designId.toUpperCase()}`])(
    'rejects %j',
    (hash) => expect(parseMyHash(hash)).toBeNull(),
  );
});
