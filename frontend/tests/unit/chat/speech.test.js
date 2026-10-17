import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_VOICE, MAX_SPEAK_CHARS, VOICES, createSpeaker, createSpeechPrefs, speechErrorMessage,
} from '../../../src/chat/speech.js';
import { sendChatMessage, synthesizeSpeech } from '../../../src/api/client.js';

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), data };
}

/** A fake <audio>: play() resolves (or rejects); end() fires onended like the real element. */
function fakeAudioFactory({ playFails = false } = {}) {
  const made = [];
  const create = () => {
    const audio = {
      src: '', paused: true,
      play: vi.fn(async () => {
        if (playFails) throw new Error('NotAllowedError');
        audio.paused = false;
      }),
      pause: vi.fn(() => { audio.paused = true; }),
      end: () => audio.onended?.(),
    };
    made.push(audio);
    return audio;
  };
  return { create, made };
}

function fakeUrls() {
  let n = 0;
  const live = new Set();
  return {
    createObjectURL: vi.fn(() => { n += 1; live.add(`blob:${n}`); return `blob:${n}`; }),
    revokeObjectURL: vi.fn((url) => live.delete(url)),
    live,
  };
}

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

describe('speech prefs', () => {
  it('speaks by default with the default voice, and remembers changes in this browser', () => {
    const storage = memoryStorage();
    const prefs = createSpeechPrefs(storage);
    expect(prefs.isEnabled()).toBe(true);
    expect(prefs.getVoice()).toBe(DEFAULT_VOICE);
    const seen = [];
    prefs.subscribe((state) => seen.push(state));
    prefs.setEnabled(false);
    expect(prefs.setVoice('marin')).toBe(true);
    expect(prefs.setVoice('robot')).toBe(false);
    expect(seen).toEqual([{ enabled: false, voice: DEFAULT_VOICE }, { enabled: false, voice: 'marin' }]);
    const again = createSpeechPrefs(storage);
    expect([again.isEnabled(), again.getVoice()]).toEqual([false, 'marin']);
  });

  it('ignores a tampered stored voice and survives blocked storage', () => {
    expect(createSpeechPrefs(memoryStorage({ 'banai.speech.voice': '<script>' })).getVoice()).toBe(DEFAULT_VOICE);
    const blocked = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    const prefs = createSpeechPrefs(blocked);
    expect(prefs.isEnabled()).toBe(true);
    prefs.setEnabled(false);
    expect(prefs.isEnabled()).toBe(false);
  });

  it('offers OpenAI\'s voices, cedar first', () => {
    expect(VOICES[0]).toBe('cedar');
    expect(VOICES).toHaveLength(13);
  });
});

describe('speaker', () => {
  it('makes the audio, plays it, and frees it when it ends', async () => {
    const audio = fakeAudioFactory();
    const urls = fakeUrls();
    const synthesize = vi.fn(async () => new Blob(['mp3']));
    const speaker = createSpeaker({ synthesize, createAudio: audio.create, urls });
    const states = [];
    speaker.subscribe((state) => states.push(state));
    await expect(speaker.speak('  שלום  ', 'marin')).resolves.toBe(true);
    expect(synthesize).toHaveBeenCalledWith('שלום', 'marin', { signal: expect.any(AbortSignal) });
    expect(audio.made[0].src).toBe('blob:1');
    expect(speaker.getState()).toBe('playing');
    audio.made[0].end();
    expect(speaker.getState()).toBe('idle');
    expect(urls.live.size).toBe(0);
    expect(states).toEqual(['loading', 'playing', 'idle']);
  });

  it('a newer answer or stop() cancels one still being made: a late answer never talks', async () => {
    const audio = fakeAudioFactory();
    const urls = fakeUrls();
    const first = deferred();
    const synthesize = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(new Blob(['b']));
    const speaker = createSpeaker({ synthesize, createAudio: audio.create, urls });
    const late = speaker.speak('תשובה ראשונה');
    speaker.stop();
    first.resolve(new Blob(['a']));
    await expect(late).resolves.toBe(false);
    expect(audio.made).toHaveLength(0);
    expect(speaker.getState()).toBe('idle');

    await speaker.speak('אחת');
    await speaker.speak('שתיים'); // replaces the one playing
    expect(audio.made[0].pause).toHaveBeenCalled();
    expect(urls.live.size).toBe(1);
    expect(speaker.getState()).toBe('playing');
    speaker.stop();
    expect(urls.live.size).toBe(0);
  });

  it('reports a server error or a refused playback by code, and goes quiet', async () => {
    const onError = vi.fn();
    const failing = createSpeaker({ synthesize: async () => { throw Object.assign(new Error('x'), { code: 'BUSY' }); }, onError, createAudio: fakeAudioFactory().create, urls: fakeUrls() });
    await expect(failing.speak('שלום')).resolves.toBe(false);
    expect(onError).toHaveBeenLastCalledWith(expect.objectContaining({ code: 'BUSY' }));
    expect(failing.getState()).toBe('idle');

    const urls = fakeUrls();
    const refused = createSpeaker({ synthesize: async () => new Blob(['a']), onError, createAudio: fakeAudioFactory({ playFails: true }).create, urls });
    await expect(refused.speak('שלום')).resolves.toBe(false);
    expect(onError).toHaveBeenLastCalledWith({ code: 'PLAYBACK' });
    expect(urls.live.size).toBe(0);
  });

  it('says nothing for an empty reply, and caps a long one at the server\'s limit', async () => {
    const synthesize = vi.fn(async () => new Blob(['a']));
    const speaker = createSpeaker({ synthesize, createAudio: fakeAudioFactory().create, urls: fakeUrls() });
    await expect(speaker.speak('   ')).resolves.toBe(false);
    expect(synthesize).not.toHaveBeenCalled();
    await speaker.speak('א'.repeat(MAX_SPEAK_CHARS + 50));
    expect(synthesize.mock.calls[0][0]).toHaveLength(MAX_SPEAK_CHARS);
  });

  it('shows Hebrew messages by code, with a fallback that says the answer is still written', () => {
    expect(speechErrorMessage('INVALID_FORMAT')).toContain('מפתח OpenAI');
    expect(speechErrorMessage('PLAYBACK')).toContain('בכתב');
    expect(speechErrorMessage('WHATEVER')).toContain('בכתב');
  });
});

describe('api: spoken replies', () => {
  it('posts the key, text and voice as JSON (never in the URL) and returns the audio', async () => {
    const audio = new Blob(['mp3'], { type: 'audio/mpeg' });
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, blob: async () => audio });
    await expect(synthesizeSpeech('sk-test', 'שלום', 'marin', { fetchImpl })).resolves.toBe(audio);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://localhost:8000/api/voice/speak');
    expect(JSON.parse(init.body)).toEqual({ apiKey: 'sk-test', text: 'שלום', voice: 'marin' });
  });

  it('throws with the envelope code', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({ success: false, error: { code: 'BUSY', message: 'busy' } }) });
    await expect(synthesizeSpeech('sk-test', 'שלום', 'cedar', { fetchImpl })).rejects.toMatchObject({ code: 'BUSY' });
  });

  it('marks a spoken chat turn, and only then', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: { reply: 'x' } }) });
    const design = { dimensions: {} };
    await sendChatMessage('sk-test', [], { design, revision: 2, spoken: true }, fetchImpl);
    await sendChatMessage('sk-test', [], { design, revision: 2, spoken: false }, fetchImpl);
    const bodies = fetchImpl.mock.calls.map(([, init]) => JSON.parse(init.body));
    expect(bodies[0]).toMatchObject({ revision: 2, spoken: true });
    expect(bodies[1]).not.toHaveProperty('spoken');
  });
});

describe('speaker: security review (ADR-028)', () => {
  it('aborts the request of an answer that is no longer wanted', async () => {
    const signals = [];
    const synthesize = vi.fn((text, voice, { signal }) => { signals.push(signal); return new Promise(() => {}); });
    const speaker = createSpeaker({ synthesize, createAudio: fakeAudioFactory().create, urls: fakeUrls() });
    speaker.speak('ראשונה');
    speaker.speak('שנייה');
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
    speaker.stop();
    expect(signals[1].aborted).toBe(true);
  });

  it('never reads a message off the object prototype', () => {
    expect(speechErrorMessage('constructor')).toContain('בכתב');
    expect(speechErrorMessage('toString')).toContain('בכתב');
  });
});
