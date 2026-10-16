import { describe, expect, it, vi } from 'vitest';
import {
  createVoiceModel, MAX_SPOKEN_CHARS, spokenText, SPEAK_STORAGE_KEY, VOICE_MESSAGES,
} from '../../../src/voice/voiceModel.js';

const flush = () => new Promise((resolve) => { setTimeout(resolve, 0); });

function setup(overrides = {}) {
  const blob = new Blob(['a']);
  const recorder = { start: vi.fn().mockResolvedValue(undefined), stop: vi.fn().mockResolvedValue(blob) };
  const players = [];
  const deps = {
    recorder,
    transcribe: vi.fn().mockResolvedValue('add a shelf'),
    speak: vi.fn().mockResolvedValue(new Blob(['mp3'])),
    play: vi.fn((audio, onEnd) => {
      const player = { stop: vi.fn(), end: onEnd };
      players.push(player);
      return player;
    }),
    sendText: vi.fn(() => ({ ok: true })),
    storage: null,
    ...overrides,
  };
  return { model: createVoiceModel(deps), deps, recorder, players, blob };
}

describe('recording flow', () => {
  it('records, transcribes and sends the transcript as a normal chat message', async () => {
    const { model, deps, blob } = setup();
    await model.toggleRecording();
    expect(model.getState().state).toBe('recording');
    await model.toggleRecording();
    expect(deps.transcribe).toHaveBeenCalledWith(blob);
    expect(deps.sendText).toHaveBeenCalledWith('add a shelf');
    expect(model.getState()).toMatchObject({ state: 'idle', notice: '' });
  });

  it('ignores presses while transcribing', async () => {
    let finish;
    const transcribe = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
    const { model, deps } = setup({ transcribe });
    await model.toggleRecording();
    const stopping = model.toggleRecording();
    await flush();
    expect(model.getState().state).toBe('transcribing');
    await model.toggleRecording();
    expect(deps.recorder.start).toHaveBeenCalledTimes(1);
    finish('hello');
    await stopping;
    expect(model.getState().state).toBe('idle');
  });

  it.each([
    ['denied', { code: 'denied' }, VOICE_MESSAGES.denied],
    ['no-device', { code: 'no-device' }, VOICE_MESSAGES['no-device']],
  ])('shows a clear note when the microphone cannot start (%s)', async (_name, error, text) => {
    const { model } = setup({ recorder: { start: vi.fn().mockRejectedValue(error), stop: vi.fn() } });
    await model.toggleRecording();
    expect(model.getState()).toMatchObject({ state: 'idle', notice: text });
  });

  it('maps server failures to friendly notes and sends nothing', async () => {
    const cases = [
      [{ code: 'NO_SPEECH', status: 422 }, VOICE_MESSAGES.NO_SPEECH],
      [{ status: 429 }, VOICE_MESSAGES[429]],
      [{ status: 503 }, VOICE_MESSAGES[503]],
      [new Error('boom'), VOICE_MESSAGES.default],
    ];
    for (const [error, text] of cases) {
      const { model, deps } = setup({ transcribe: vi.fn().mockRejectedValue(error) });
      await model.toggleRecording();
      await model.toggleRecording();
      expect(model.getState().notice).toBe(text);
      expect(deps.sendText).not.toHaveBeenCalled();
    }
  });

  it('asks the customer to wait when the chat is busy', async () => {
    const { model } = setup({ sendText: vi.fn(() => ({ ok: false, reason: 'busy' })) });
    await model.toggleRecording();
    await model.toggleRecording();
    expect(model.getState().notice).toMatch(/wait/i);
  });
});

describe('speaking replies', () => {
  it('is off by default and does nothing', async () => {
    const { model, deps } = setup();
    await model.speakReply('Hello');
    expect(deps.speak).not.toHaveBeenCalled();
  });

  it('reads a reply when enabled, remembers the choice, and ends cleanly', async () => {
    const store = new Map();
    const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
    const { model, deps, players } = setup({ storage });
    model.setSpeakReplies(true);
    expect(store.get(SPEAK_STORAGE_KEY)).toBe('1');
    await model.speakReply('Hello');
    expect(deps.speak).toHaveBeenCalledWith('Hello');
    expect(model.getState().speaking).toBe(true);
    players[0].end();
    expect(model.getState().speaking).toBe(false);
    expect(createVoiceModel({ ...deps, storage }).getState().speakReplies).toBe(true);
  });

  it('a newer reply, a recording or switching off stops the current audio', async () => {
    const { model, players } = setup();
    model.setSpeakReplies(true);
    await model.speakReply('one');
    await model.speakReply('two');
    expect(players[0].stop).toHaveBeenCalled();
    await model.toggleRecording();
    expect(players[1].stop).toHaveBeenCalled();
    model.setSpeakReplies(false);
    expect(model.getState().speaking).toBe(false);
  });

  it('drops audio that arrives after it was superseded', async () => {
    let release;
    const speak = vi.fn(() => new Promise((resolve) => { release = resolve; }));
    const { model, deps } = setup({ speak });
    model.setSpeakReplies(true);
    const first = model.speakReply('slow');
    model.setSpeakReplies(false);
    release(new Blob(['x']));
    await first;
    expect(deps.play).not.toHaveBeenCalled();
  });

  it('stays silent when speech fails because the text is already on screen', async () => {
    const { model } = setup({ speak: vi.fn().mockRejectedValue(new Error('x')) });
    model.setSpeakReplies(true);
    await model.speakReply('Hello');
    expect(model.getState()).toMatchObject({ speaking: false, notice: '' });
  });

  it('survives a broken storage', () => {
    const blocked = () => { throw new Error('blocked'); };
    const { model } = setup({ storage: { getItem: blocked, setItem: blocked } });
    expect(model.getState().speakReplies).toBe(false);
    expect(() => model.setSpeakReplies(true)).not.toThrow();
  });
});

describe('spokenText', () => {
  it('joins the reply and the changes and respects the server limit', () => {
    expect(spokenText('Here you go.', [{ title: 'Add shelf', detail: 'In compartment 2.' }])).toBe('Here you go. Add shelf. In compartment 2.');
    expect(spokenText('', [])).toBe('');
    expect(spokenText('x'.repeat(2000))).toHaveLength(MAX_SPOKEN_CHARS);
  });
});


describe('the recording time limit', () => {
  it('transcribes and sends the recording when the recorder stops by itself', async () => {
    let limit;
    const blob = new Blob(['a']);
    const recorder = { start: vi.fn().mockResolvedValue(undefined), stop: vi.fn(), onLimit: (handler) => { limit = handler; } };
    const { model, deps } = setup({ recorder });
    await model.toggleRecording();
    expect(model.getState().state).toBe('recording');
    await limit(Promise.resolve(blob));
    expect(deps.transcribe).toHaveBeenCalledWith(blob);
    expect(deps.sendText).toHaveBeenCalledWith('add a shelf');
    expect(model.getState().state).toBe('idle');
  });

  it('shows a note when the limit-stopped recording is unusable', async () => {
    let limit;
    const recorder = { start: vi.fn().mockResolvedValue(undefined), stop: vi.fn(), onLimit: (handler) => { limit = handler; } };
    const { model } = setup({ recorder });
    await model.toggleRecording();
    await limit(Promise.reject({ code: 'too-long' }));
    expect(model.getState()).toMatchObject({ state: 'idle', notice: VOICE_MESSAGES['too-long'] });
  });
});
