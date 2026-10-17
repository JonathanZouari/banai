import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { transcribeAudio } from '../../../src/api/client.js';
import {
  AUDIO_BITS_PER_SECOND,
  CANCEL_DISTANCE_PX,
  IDLE,
  MAX_AUDIO_BYTES,
  MAX_RECORDING_MS,
  MIME_CANDIDATES,
  MIN_RECORDING_MS,
  TAP_MS,
  VOICE_MESSAGES,
  createPushToTalk,
  deliverTranscript,
  formatClock,
  hintFor,
  levelFromSamples,
  pickMimeType,
  recordingProblem,
  step,
  voiceErrorCode,
  voiceErrorMessage,
} from '../../../src/chat/voice.js';

const KEY = 'sk-proj-abcdefghijklmnopqrstuvwxyz0123456789WXYZ';

describe('gesture state machine', () => {
  const run = (events, state = IDLE) => events.reduce(({ state: s, effects }, event) => {
    const result = step(s, event);
    return { state: result.state, effects: [...effects, result.effect] };
  }, { state, effects: [] });
  const press = (x = 0, y = 0, at = 0) => ({ type: 'press', x, y, at });
  const move = (x, y) => ({ type: 'move', x, y });
  const release = (at) => ({ type: 'release', at });

  it('hold and release sends', () => {
    const { state, effects } = run([press(), move(10, 10), release(TAP_MS + 500)]);
    expect(effects).toEqual(['start', null, 'send']);
    expect(state.phase).toBe('busy');
    expect(run([{ type: 'done' }], state).state).toBe(IDLE);
  });

  it(`dragging more than ${CANCEL_DISTANCE_PX} px away arms cancel, and coming back disarms it`, () => {
    expect(run([press(), move(0, CANCEL_DISTANCE_PX), release(1000)]).effects).toEqual(['start', null, 'send']);
    expect(run([press(), move(CANCEL_DISTANCE_PX + 1, 0), release(1000)])).toEqual({ state: IDLE, effects: ['start', 'arm', 'cancel'] });
    const back = run([press(), move(-50, -50), move(5, 5), release(1000)]);
    expect(back.effects).toEqual(['start', 'arm', 'disarm', 'send']);
  });

  it('a short tap switches to hands-free; the next tap sends and its release is ignored', () => {
    const tapped = run([press(0, 0, 1000), release(1000 + TAP_MS - 1)]);
    expect(tapped.state).toEqual({ phase: 'free' });
    expect(tapped.effects).toEqual(['start', 'free']);
    const sent = run([move(500, 500), release(5000), press(), release(9000)], tapped.state);
    expect(sent.effects).toEqual([null, null, 'send', null]);
    expect(sent.state.phase).toBe('busy');
  });

  it('a tap after dragging away still cancels instead of going hands-free', () => {
    expect(run([press(0, 0, 0), move(100, 0), release(100)]).effects).toEqual(['start', 'arm', 'cancel']);
  });

  it('Space or Enter starts hands-free and sends; Escape cancels', () => {
    expect(run([{ type: 'key' }, { type: 'key' }]).effects).toEqual(['start', 'send']);
    expect(run([{ type: 'key' }, { type: 'escape' }])).toEqual({ state: IDLE, effects: ['start', 'cancel'] });
    expect(run([press(), { type: 'key' }]).effects).toEqual(['start', 'send']);
  });

  it('stops on its own at the limit, in either mode', () => {
    expect(run([press(), { type: 'limit' }]).effects).toEqual(['start', 'send']);
    expect(run([{ type: 'key' }, { type: 'limit' }]).effects).toEqual(['start', 'send']);
    expect(run([{ type: 'limit' }]).effects).toEqual([null]);
  });

  it('a lost pointer cancels a hold but not hands-free; hiding the page cancels both', () => {
    expect(run([press(), { type: 'lost' }])).toEqual({ state: IDLE, effects: ['start', 'cancel'] });
    expect(run([{ type: 'key' }, { type: 'lost' }]).state).toEqual({ phase: 'free' });
    expect(run([{ type: 'key' }, { type: 'hidden' }])).toEqual({ state: IDLE, effects: ['start', 'cancel'] });
  });

  it('a press during a hold whose release was lost ends the hold', () => {
    expect(run([press(), press()]).effects).toEqual(['start', 'send']);
    expect(run([press(), move(200, 0), press()]).effects).toEqual(['start', 'arm', 'cancel']);
  });

  it('ignores input while transcribing, and a failure returns to idle', () => {
    const busy = run([press(), release(5000)]).state;
    expect(run([press(), { type: 'key' }, { type: 'escape' }, { type: 'limit' }, { type: 'lost' }], busy)).toEqual({ state: busy, effects: [null, null, null, null, null] });
    expect(run([press(), { type: 'fail' }]).state).toBe(IDLE);
    expect(step(IDLE, { type: 'unknown' })).toEqual({ state: IDLE, effect: null });
  });
});

describe('mime choice', () => {
  it('prefers Opus in WebM, then falls back to what MediaRecorder supports', () => {
    expect(MIME_CANDIDATES[0]).toBe('audio/webm;codecs=opus');
    expect(pickMimeType(() => true)).toBe('audio/webm;codecs=opus');
    expect(pickMimeType((type) => type === 'audio/webm')).toBe('audio/webm');
    expect(pickMimeType((type) => type.startsWith('audio/ogg'))).toBe('audio/ogg;codecs=opus');
    expect(pickMimeType((type) => type === 'audio/mp4')).toBe('audio/mp4'); // Safari
  });

  it("lets the browser choose when nothing matches or the check isn't there", () => {
    expect(pickMimeType(() => false)).toBe('');
    expect(pickMimeType(undefined)).toBe('');
    expect(pickMimeType(() => {
      throw new Error('boom');
    })).toBe('');
  });
});

describe('error mapping', () => {
  const domError = (name) => Object.assign(new Error('Permission denied by system'), { name, code: 8 });

  it('maps microphone failures by DOMException name', () => {
    expect(voiceErrorCode(domError('NotAllowedError'), 'mic')).toBe('NO_PERMISSION');
    expect(voiceErrorCode(domError('SecurityError'), 'mic')).toBe('NO_PERMISSION');
    expect(voiceErrorCode(domError('NotFoundError'), 'mic')).toBe('NO_MICROPHONE');
    expect(voiceErrorCode(domError('OverconstrainedError'), 'mic')).toBe('NO_MICROPHONE');
    expect(voiceErrorCode(domError('NotReadableError'), 'mic')).toBe('MIC_BUSY');
    expect(voiceErrorCode(domError('NotSupportedError'), 'mic')).toBe('UNSUPPORTED');
    expect(voiceErrorCode({ code: 'UNSUPPORTED' }, 'mic')).toBe('UNSUPPORTED');
    expect(voiceErrorCode(new TypeError('x'), 'mic')).toBe('MIC_BUSY');
  });

  it('maps server codes, with aliases, and anything else to a generic failure', () => {
    expect(voiceErrorCode({ code: 'INVALID_KEY' })).toBe('INVALID_KEY');
    expect(voiceErrorCode({ code: 'INVALID_FORMAT' })).toBe('INVALID_FORMAT');
    expect(voiceErrorCode({ code: 'BUSY' })).toBe('BUSY');
    expect(voiceErrorCode({ code: 'EMPTY_AUDIO' })).toBe('TOO_SHORT');
    expect(voiceErrorCode({ code: 'PAYLOAD_TOO_LARGE' })).toBe('TOO_LONG');
    expect(voiceErrorCode({ code: 'UPSTREAM' })).toBe('FAILED');
    expect(voiceErrorCode({ code: 'SOMETHING_NEW' })).toBe('FAILED');
    expect(voiceErrorCode({ code: '__proto__' })).toBe('FAILED');
    expect(voiceErrorCode(domError('AbortError'))).toBe('FAILED'); // a DOMException's numeric code is not ours
    expect(voiceErrorCode(new TypeError('Failed to fetch'))).toBe('FAILED');
    expect(voiceErrorCode(null)).toBe('FAILED');
  });

  it('shows Hebrew text and never the error’s own message', () => {
    const error = Object.assign(new Error(`Incorrect API key provided: ${KEY}`), { code: 'INVALID_KEY' });
    const message = voiceErrorMessage(error);
    expect(message).toBe(VOICE_MESSAGES.INVALID_KEY);
    expect(message).not.toContain('sk-');
    expect(message).toMatch(/[֐-׿]/);
    for (const text of Object.values(VOICE_MESSAGES)) expect(text).toMatch(/[֐-׿]/);
  });
});

describe('level, checks and texts', () => {
  it('measures the RMS level of 8-bit samples', () => {
    expect(levelFromSamples(new Uint8Array(64).fill(128))).toBe(0);
    expect(levelFromSamples(Uint8Array.from({ length: 64 }, (_, i) => (i % 2 ? 136 : 120)))).toBeCloseTo(0.25);
    expect(levelFromSamples(Uint8Array.from({ length: 64 }, (_, i) => (i % 2 ? 255 : 0)))).toBe(1);
    expect(levelFromSamples(new Uint8Array(0))).toBe(0);
  });

  it('refuses recordings that are too short, too large or silent', () => {
    expect(recordingProblem({ durationMs: MIN_RECORDING_MS - 1, bytes: 5000, peak: 0.5 })).toBe('TOO_SHORT');
    expect(recordingProblem({ durationMs: 2000, bytes: 0, peak: 0.5 })).toBe('TOO_SHORT');
    expect(recordingProblem({ durationMs: Number.NaN, bytes: 5000 })).toBe('TOO_SHORT');
    expect(recordingProblem({ durationMs: 2000, bytes: MAX_AUDIO_BYTES + 1, peak: 0.5 })).toBe('TOO_LONG');
    expect(recordingProblem({ durationMs: 2000, bytes: 5000, peak: 0.01 })).toBe('NO_SPEECH');
    expect(recordingProblem({ durationMs: 2000, bytes: 5000, peak: null })).toBeNull(); // unmeasured: send it
    expect(recordingProblem({ durationMs: MIN_RECORDING_MS, bytes: MAX_AUDIO_BYTES, peak: 0.3 })).toBeNull();
  });

  it('gives the prototype hints and a m:ss clock', () => {
    expect(hintFor({ phase: 'hold', armed: false })).toBe('שחררו לשליחה · גררו לביטול');
    expect(hintFor({ phase: 'hold', armed: true })).toBe('שחררו כדי לבטל');
    expect(hintFor({ phase: 'free' })).toBe('מקליט. לחצו שוב כדי לשלוח');
    expect(hintFor({ phase: 'busy' })).toBe('מתמלל…');
    expect(hintFor(IDLE)).toBe('');
    expect([formatClock(0), formatClock(7999), formatClock(MAX_RECORDING_MS), formatClock(-5)]).toEqual(['0:00', '0:07', '0:30', '0:00']);
  });
});

describe('deliverTranscript', () => {
  const fakeInput = (value = '') => ({ value, focus: vi.fn(), dispatchEvent: vi.fn() });

  it('sends through the composer path and leaves the draft alone', () => {
    const send = vi.fn(() => ({ ok: true }));
    const input = fakeInput('draft');
    const toast = vi.fn();
    expect(deliverTranscript('שני מדפים', { send, input, toast })).toBe(true);
    expect(send).toHaveBeenCalledWith('שני מדפים');
    expect(input.value).toBe('draft');
    expect(toast).not.toHaveBeenCalled();
  });

  it('keeps a refused transcript in the composer instead of losing it', () => {
    const toast = vi.fn();
    const empty = fakeInput();
    expect(deliverTranscript('מגירה', { send: () => ({ ok: false, reason: 'busy' }), input: empty, toast })).toBe(false);
    expect(empty.value).toBe('מגירה');
    expect(empty.focus).toHaveBeenCalled();
    expect(empty.dispatchEvent.mock.calls[0][0].type).toBe('input');
    expect(toast.mock.calls[0][0]).toContain('בוב עוד עונה');
    const drafted = fakeInput('ארון לבן  ');
    deliverTranscript('עם מראה', { send: () => ({ ok: false, reason: 'too-long' }), input: drafted, toast });
    expect(drafted.value).toBe('ארון לבן עם מראה');
  });
});

// --- the recording controller, against a fake browser -----------------------------------------------

class FakeRecorder {
  constructor(options, bytes, { stops = true } = {}) {
    this.options = options;
    this.bytes = bytes;
    this.stops = stops;
    this.state = 'inactive';
    this.mimeType = options.mimeType ?? 'audio/ogg;codecs=opus';
  }

  start() {
    this.state = 'recording';
  }

  stop() {
    if (this.state === 'inactive' || !this.stops) return;
    this.state = 'inactive';
    queueMicrotask(() => {
      this.ondataavailable?.({ data: new Blob([new Uint8Array(this.bytes)], { type: this.mimeType }) });
      this.onstop?.();
    });
  }
}

function setup({
  supported = true, micError = null, types = ['audio/webm;codecs=opus'], amplitude = 40, bytes = 4000, audioContext = true,
  ctxState = 'running', recorderStops = true, transcribe = async () => 'שלושה מדפים בתא הימני', getUserMedia = null,
} = {}) {
  const track = { stop: vi.fn() };
  const stream = { getTracks: () => [track] };
  const recorders = [];
  const ctx = {
    state: ctxState,
    resume: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    createAnalyser: () => ({
      fftSize: 0,
      getByteTimeDomainData: (buffer) => buffer.forEach((_, i) => { buffer[i] = 128 + (i % 2 ? amplitude : -amplitude); }),
    }),
    createMediaStreamSource: () => ({ connect: vi.fn(), disconnect: vi.fn() }),
  };
  const env = {
    supported: () => supported,
    getUserMedia: vi.fn(getUserMedia ?? (async () => {
      if (micError) throw Object.assign(new Error('Permission denied'), { name: micError });
      return stream;
    })),
    isTypeSupported: (type) => types.includes(type),
    createRecorder: vi.fn((_stream, options) => {
      const recorder = new FakeRecorder(options, bytes, { stops: recorderStops });
      recorders.push(recorder);
      return recorder;
    }),
    createAudioContext: vi.fn(() => (audioContext ? ctx : null)),
    now: () => Date.now(),
    setTimeout: (callback, ms) => setTimeout(callback, ms),
    clearTimeout: (id) => clearTimeout(id),
    setInterval: (callback, ms) => setInterval(callback, ms),
    clearInterval: (id) => clearInterval(id),
    requestAnimationFrame: vi.fn(() => 1),
    cancelAnimationFrame: vi.fn(),
    reducedMotion: () => false,
  };
  const toast = vi.fn();
  const deliver = vi.fn();
  const transcriber = vi.fn(transcribe);
  const phases = [];
  const view = { render: (state) => phases.push(state.phase), level: vi.fn(), elapsed: vi.fn() };
  const ptt = createPushToTalk({ env, transcribe: transcriber, deliver, toast, view });
  return {
    env, ctx, track, recorders, toast, deliver, transcribe: transcriber, view, phases, ptt,
    press: (x = 0, y = 0) => ptt.dispatch({ type: 'press', x, y, at: Date.now() }),
    move: (x, y) => ptt.dispatch({ type: 'move', x, y, at: Date.now() }),
    release: () => ptt.dispatch({ type: 'release', x: 0, y: 0, at: Date.now() }),
    key: () => ptt.dispatch({ type: 'key' }),
  };
}

const wait = (ms = 0) => vi.advanceTimersByTimeAsync(ms);

describe('createPushToTalk', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('hold, speak and release: records Opus, transcribes it and sends the text', async () => {
    const t = setup();
    t.press();
    await wait();
    expect(t.env.getUserMedia).toHaveBeenCalledWith({ audio: expect.objectContaining({ echoCancellation: true, noiseSuppression: true }) });
    expect(t.ctx.resume).toHaveBeenCalled(); // created and resumed inside the press
    expect(t.recorders[0].options).toEqual({ mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: AUDIO_BITS_PER_SECOND });
    expect(t.recorders[0].state).toBe('recording');
    await wait(2000);
    expect(t.view.level).toHaveBeenCalled();
    expect(t.view.elapsed).toHaveBeenLastCalledWith(2000);
    t.release();
    await wait();
    expect(t.transcribe).toHaveBeenCalledTimes(1);
    const [blob, mimeType] = t.transcribe.mock.calls[0];
    expect(blob.size).toBe(4000);
    expect(mimeType).toBe('audio/webm;codecs=opus');
    expect(t.deliver).toHaveBeenCalledWith('שלושה מדפים בתא הימני');
    expect(t.toast).not.toHaveBeenCalled();
    expect(t.track.stop).toHaveBeenCalled(); // the microphone is off
    expect(t.ctx.close).toHaveBeenCalled();
    expect(t.phases).toEqual(['hold', 'busy', 'idle']);
  });

  it('a short tap records hands-free until the next tap', async () => {
    const t = setup();
    t.press();
    await wait(TAP_MS - 50);
    t.release();
    expect(t.ptt.getState()).toEqual({ phase: 'free' });
    await wait(4000);
    expect(t.transcribe).not.toHaveBeenCalled();
    t.press();
    t.release(); // the second tap's release is ignored
    await wait();
    expect(t.transcribe).toHaveBeenCalledTimes(1);
    expect(t.deliver).toHaveBeenCalledTimes(1);
    expect(t.ptt.getState()).toBe(IDLE);
  });

  it('dragging away cancels: nothing is uploaded and the microphone turns off', async () => {
    const t = setup();
    t.press(100, 100);
    await wait(1500);
    t.move(100, 100 + CANCEL_DISTANCE_PX + 1);
    expect(t.ptt.getState().armed).toBe(true);
    t.release();
    await wait(3000);
    expect(t.transcribe).not.toHaveBeenCalled();
    expect(t.toast).not.toHaveBeenCalled();
    expect(t.track.stop).toHaveBeenCalled();
    expect(t.recorders[0].state).toBe('inactive');
    expect(t.ptt.getState()).toBe(IDLE);
  });

  it(`stops on its own at ${MAX_RECORDING_MS / 1000} s and sends`, async () => {
    const t = setup();
    t.key();
    await wait(MAX_RECORDING_MS - 1);
    expect(t.transcribe).not.toHaveBeenCalled();
    await wait(1);
    expect(t.transcribe).toHaveBeenCalledTimes(1);
    expect(t.deliver).toHaveBeenCalled();
    expect(t.view.elapsed).toHaveBeenCalledWith(MAX_RECORDING_MS - 250);
    await wait(MAX_RECORDING_MS);
    expect(t.transcribe).toHaveBeenCalledTimes(1); // the limit fires once
  });

  it('Space or Enter starts and sends; Escape cancels', async () => {
    const t = setup();
    t.key();
    await wait(1500);
    t.key();
    await wait();
    expect(t.deliver).toHaveBeenCalledTimes(1);
    t.key();
    await wait(1500);
    t.ptt.dispatch({ type: 'escape' });
    await wait();
    expect(t.transcribe).toHaveBeenCalledTimes(1);
    expect(t.ptt.getState()).toBe(IDLE);
  });

  it('too short a recording is not uploaded', async () => {
    const t = setup();
    t.press();
    await wait(MIN_RECORDING_MS - 200);
    t.release();
    await wait();
    expect(t.transcribe).not.toHaveBeenCalled();
    expect(t.toast).toHaveBeenCalledWith(VOICE_MESSAGES.TOO_SHORT);
    expect(t.track.stop).toHaveBeenCalled();
    expect(t.ptt.getState()).toBe(IDLE);
  });

  it('a silent recording is not uploaded', async () => {
    const t = setup({ amplitude: 0 });
    t.press();
    await wait(2000);
    t.release();
    await wait();
    expect(t.transcribe).not.toHaveBeenCalled();
    expect(t.toast).toHaveBeenCalledWith(VOICE_MESSAGES.NO_SPEECH);
  });

  it('without a working meter the silence check is skipped, not failed', async () => {
    for (const options of [{ amplitude: 0, ctxState: 'suspended' }, { amplitude: 0, audioContext: false }]) {
      const t = setup(options);
      t.press();
      await wait(2000);
      t.release();
      await wait();
      expect(t.transcribe).toHaveBeenCalledTimes(1);
    }
  });

  it('a recording over the upload cap is not sent', async () => {
    const t = setup({ bytes: MAX_AUDIO_BYTES + 1 });
    t.press();
    await wait(2000);
    t.release();
    await wait();
    expect(t.transcribe).not.toHaveBeenCalled();
    expect(t.toast).toHaveBeenCalledWith(VOICE_MESSAGES.TOO_LONG);
  });

  it.each([
    ['NotAllowedError', 'NO_PERMISSION'],
    ['NotFoundError', 'NO_MICROPHONE'],
    ['NotReadableError', 'MIC_BUSY'],
  ])('a microphone %s shows the %s message', async (name, code) => {
    const t = setup({ micError: name });
    t.press();
    await wait();
    expect(t.toast).toHaveBeenCalledWith(VOICE_MESSAGES[code]);
    expect(t.env.createRecorder).not.toHaveBeenCalled();
    expect(t.ctx.close).toHaveBeenCalled();
    expect(t.ptt.getState()).toBe(IDLE);
    t.release(); // the release after the failure changes nothing
    expect(t.ptt.getState()).toBe(IDLE);
  });

  it('a browser without recording support says so and asks for nothing', async () => {
    const t = setup({ supported: false });
    t.key();
    await wait();
    expect(t.toast).toHaveBeenCalledWith(VOICE_MESSAGES.UNSUPPORTED);
    expect(t.env.getUserMedia).not.toHaveBeenCalled();
    expect(t.ptt.getState()).toBe(IDLE);
  });

  it('a transcription error is shown by code, never with the server text', async () => {
    const t = setup({ transcribe: async () => { throw Object.assign(new Error(`Incorrect API key provided: ${KEY}`), { code: 'INVALID_KEY' }); } });
    t.press();
    await wait(2000);
    t.release();
    await wait();
    expect(t.toast).toHaveBeenCalledWith(VOICE_MESSAGES.INVALID_KEY);
    expect(t.toast.mock.calls.flat().join(' ')).not.toContain('sk-');
    expect(t.deliver).not.toHaveBeenCalled();
    expect(t.ptt.getState()).toBe(IDLE);
  });

  it('a network failure says the transcription failed', async () => {
    const t = setup({ transcribe: async () => { throw new TypeError('Failed to fetch'); } });
    t.key();
    await wait(2000);
    t.key();
    await wait();
    expect(t.toast).toHaveBeenCalledWith(VOICE_MESSAGES.FAILED);
  });

  it('an empty transcript is not sent', async () => {
    const t = setup({ transcribe: async () => '   ' });
    t.key();
    await wait(2000);
    t.key();
    await wait();
    expect(t.deliver).not.toHaveBeenCalled();
    expect(t.toast).toHaveBeenCalledWith(VOICE_MESSAGES.NO_SPEECH);
  });

  it('releasing before the microphone starts frees it as soon as it arrives', async () => {
    let grant;
    const t = setup({ getUserMedia: () => new Promise((resolve) => { grant = resolve; }) });
    t.press();
    await wait(800);
    t.release();
    await wait();
    expect(t.toast).toHaveBeenCalledWith(VOICE_MESSAGES.TOO_SHORT);
    expect(t.ptt.getState()).toBe(IDLE);
    grant({ getTracks: () => [t.track] });
    await wait();
    expect(t.track.stop).toHaveBeenCalled();
    expect(t.env.createRecorder).not.toHaveBeenCalled();
  });

  it('ignores presses while transcribing', async () => {
    let finish;
    const t = setup({ transcribe: () => new Promise((resolve) => { finish = resolve; }) });
    t.press();
    await wait(1500);
    t.release();
    await wait();
    expect(t.ptt.getState().phase).toBe('busy');
    t.press();
    t.key();
    await wait();
    expect(t.env.getUserMedia).toHaveBeenCalledTimes(1);
    finish('מדף');
    await wait();
    expect(t.deliver).toHaveBeenCalledWith('מדף');
    expect(t.ptt.getState()).toBe(IDLE);
  });

  it('hiding the page cancels the recording', async () => {
    const t = setup();
    t.key();
    await wait(1500);
    t.ptt.dispatch({ type: 'hidden' });
    await wait();
    expect(t.transcribe).not.toHaveBeenCalled();
    expect(t.track.stop).toHaveBeenCalled();
  });

  it('a recorder that never reports stop does not hang the composer', async () => {
    const t = setup({ recorderStops: false });
    t.press();
    await wait(1500);
    t.release();
    expect(t.ptt.getState().phase).toBe('busy');
    await wait(2000);
    expect(t.ptt.getState()).toBe(IDLE);
    expect(t.toast).toHaveBeenCalledWith(VOICE_MESSAGES.TOO_SHORT); // no audio came out of it
  });

  it('falls back to the format the browser supports', async () => {
    const safari = setup({ types: ['audio/mp4'] });
    safari.press();
    await wait();
    expect(safari.recorders[0].options.mimeType).toBe('audio/mp4');
    const other = setup({ types: [] });
    other.press();
    await wait(2000);
    expect(other.recorders[0].options).toEqual({ audioBitsPerSecond: AUDIO_BITS_PER_SECOND });
    other.release();
    await wait();
    expect(other.transcribe.mock.calls[0][1]).toBe('audio/ogg;codecs=opus'); // the recorder's own choice
  });

  it('dispose turns the microphone off and delivers nothing', async () => {
    const t = setup();
    t.press();
    await wait(1500);
    t.ptt.dispose();
    await wait(MAX_RECORDING_MS);
    expect(t.track.stop).toHaveBeenCalled();
    expect(t.transcribe).not.toHaveBeenCalled();
    t.press();
    expect(t.env.getUserMedia).toHaveBeenCalledTimes(1);
  });
});

describe('transcribeAudio', () => {
  it('posts the key and the audio as multipart form fields, never in the URL', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: { text: 'שלום' } }) });
    const blob = new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])], { type: 'audio/webm;codecs=opus' });
    await expect(transcribeAudio(KEY, blob, { fetchImpl })).resolves.toBe('שלום');
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://localhost:8000/api/voice/transcribe');
    expect(url).not.toContain(KEY);
    expect(init.method).toBe('POST');
    expect(init.headers).toBeUndefined(); // the browser sets the multipart boundary
    expect(init.body.get('apiKey')).toBe(KEY);
    const audio = init.body.get('audio');
    expect(audio.type).toBe('audio/webm;codecs=opus');
    expect(audio.size).toBe(4);
  });

  it('throws with the envelope code, or REQUEST_FAILED without one', async () => {
    const rejected = vi.fn().mockResolvedValue({ ok: false, status: 415, json: async () => ({ success: false, error: { code: 'UNSUPPORTED_MEDIA', message: 'x' } }) });
    await expect(transcribeAudio(KEY, new Blob(['x']), { fetchImpl: rejected })).rejects.toMatchObject({ code: 'UNSUPPORTED_MEDIA' });
    const broken = vi.fn().mockResolvedValue({ ok: false, status: 502, json: async () => { throw new Error('not json'); } });
    await expect(transcribeAudio(KEY, new Blob(['x']), { fetchImpl: broken })).rejects.toMatchObject({ code: 'REQUEST_FAILED' });
  });
});
