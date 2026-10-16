import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRecorder, pickMimeType } from '../../../src/voice/recorder.js';
import { createPlayer } from '../../../src/voice/player.js';
import { estimateSeconds, planSpeech, SPEECH_LIMITS } from '../../../src/voice/speechPlan.js';
import { createVoiceModel, describeVoiceError } from '../../../src/voice/voiceModel.js';
import { createChatModel } from '../../../src/chat/chatModel.js';
import { ApiError, speak, transcribeAudio } from '../../../src/api/client.js';

const flush = () => new Promise((resolve) => { setTimeout(resolve, 0); });

class FakeMediaRecorder {
  static types = ['audio/webm;codecs=opus', 'audio/webm'];
  static isTypeSupported(type) { return this.types.includes(type); }
  constructor(stream, options) { this.stream = stream; this.options = options; this.state = 'inactive'; this.mimeType = options?.mimeType ?? ''; }
  start() { this.state = 'recording'; }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['x'.repeat(2000)]) });
    this.onstop?.();
  }
}

function fakeMedia() {
  const track = { stop: vi.fn() };
  const mediaDevices = { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [track] }) };
  return { track, mediaDevices };
}

describe('recorder', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('picks the first supported mime type, and reports unsupported browsers', () => {
    expect(pickMimeType(FakeMediaRecorder)).toBe('audio/webm;codecs=opus');
    expect(pickMimeType(undefined)).toBeNull();
    class Safari extends FakeMediaRecorder { static types = ['audio/mp4']; }
    expect(pickMimeType(Safari)).toBe('audio/mp4');
    class None extends FakeMediaRecorder { static types = []; }
    expect(pickMimeType(None)).toBeNull();
  });

  it('records, returns a Blob and always releases the microphone', async () => {
    const { track, mediaDevices } = fakeMedia();
    const recorder = createRecorder({ mediaDevices, MediaRecorderImpl: FakeMediaRecorder });
    await recorder.start();
    expect(recorder.isRecording()).toBe(true);
    const blob = await recorder.stop();
    expect(blob.size).toBe(2000);
    expect(blob.type).toBe('audio/webm');
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(recorder.isRecording()).toBe(false);
  });

  it('releases the mic when permission is denied or the recorder cannot start', async () => {
    const denied = Object.assign(new Error('no'), { name: 'NotAllowedError' });
    const { mediaDevices } = fakeMedia();
    mediaDevices.getUserMedia.mockRejectedValue(denied);
    const recorder = createRecorder({ mediaDevices, MediaRecorderImpl: FakeMediaRecorder });
    await expect(recorder.start()).rejects.toBe(denied);
    expect(recorder.isRecording()).toBe(false);

    const second = fakeMedia();
    class Broken extends FakeMediaRecorder { constructor() { super(); throw new Error('boom'); } }
    await expect(createRecorder({ mediaDevices: second.mediaDevices, MediaRecorderImpl: Broken }).start()).rejects.toThrow('boom');
    expect(second.track.stop).toHaveBeenCalledTimes(1);
  });

  it('throws UNSUPPORTED without APIs and ignores a second start', async () => {
    await expect(createRecorder({ mediaDevices: undefined, MediaRecorderImpl: undefined }).start()).rejects.toMatchObject({ code: 'UNSUPPORTED' });
    const { mediaDevices } = fakeMedia();
    const recorder = createRecorder({ mediaDevices, MediaRecorderImpl: FakeMediaRecorder });
    await recorder.start();
    await recorder.start();
    expect(mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
    recorder.cancel();
  });

  it('auto-stops after the time limit and cancel drops the audio', async () => {
    const { track, mediaDevices } = fakeMedia();
    const recorder = createRecorder({ maxSeconds: 20, mediaDevices, MediaRecorderImpl: FakeMediaRecorder });
    const onAutoStop = vi.fn();
    await recorder.start(onAutoStop);
    vi.advanceTimersByTime(19_999);
    expect(onAutoStop).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(onAutoStop).toHaveBeenCalledTimes(1);
    recorder.cancel();
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(recorder.isRecording()).toBe(false);
  });
});

describe('player (pieces played back to back)', () => {
  function setup({ state = 'running' } = {}) {
    const sources = [];
    const context = {
      state,
      currentTime: 0,
      destination: {},
      resume: vi.fn().mockImplementation(async () => { context.state = 'running'; }),
      createBuffer: vi.fn((channels, length, rate) => ({ duration: length / rate, copyToChannel: vi.fn(), length, rate })),
      createBufferSource: vi.fn(() => {
        const source = { connect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null };
        sources.push(source);
        return source;
      }),
    };
    class FakeContext { constructor() { return context; } }
    return { context, sources, player: createPlayer({ AudioContextImpl: FakeContext }) };
  }
  const bytes = (seconds) => new Uint8Array(Math.round(seconds * 48000)).fill(1);
  const streamOf = (chunks) => {
    const queue = [...chunks];
    const reader = { read: vi.fn(async () => (queue.length ? { value: queue.shift(), done: false } : { value: undefined, done: true })), cancel: vi.fn().mockResolvedValue() };
    return { reader, response: { body: { getReader: () => reader } } };
  };
  const starts = (sources) => sources.map((source) => source.start.mock.calls[0][0]);

  it('waits for a small start buffer, then plays gap-free blocks (no stutter from starting on the first bytes)', async () => {
    const { context, sources, player } = setup();
    const playing = player.play(streamOf([bytes(0.3), bytes(0.3), bytes(0.3), bytes(0.3)]).response);
    await flush();
    expect(context.createBuffer.mock.calls[0][1]).toBe(14400); // 0.6 s = 14,400 samples: two chunks were buffered before starting
    const times = starts(sources);
    expect(times[0]).toBeCloseTo(0.12, 3); // a short lead-in so the first syllable is not clipped
    sources.forEach((source, i) => {
      if (i > 0) expect(times[i]).toBeCloseTo(times[i - 1] + context.createBuffer.mock.results[i - 1].value.duration, 3);
    });
    sources.at(-1).onended();
    await playing;
    expect(player.isPlaying()).toBe(false);
  });

  it('sizes the start buffer by the expected length of the piece (long pieces buffer more)', async () => {
    const { context, sources, player } = setup();
    const playing = player.play([{ response: streamOf([bytes(1), bytes(1), bytes(1), bytes(1), bytes(1)]).response, expectedSeconds: 10 }]);
    await flush();
    expect(context.createBuffer.mock.calls[0][1]).toBe(96000); // 35% of 10 s = 3.5 s is reached after 4 one-second chunks (3 s is not enough)
    sources.at(-1).onended();
    await playing;
  });

  it('plays several pieces in order without a gap, even when later ones were ready long before', async () => {
    const { context, sources, player } = setup();
    const playing = player.play([
      { response: Promise.resolve(streamOf([bytes(0.7)]).response), expectedSeconds: 0 },
      { response: Promise.resolve(streamOf([bytes(0.7)]).response), expectedSeconds: 0 },
      { response: Promise.resolve(streamOf([bytes(0.7)]).response), expectedSeconds: 0 },
    ]);
    await flush();
    const times = starts(sources);
    expect(sources).toHaveLength(3);
    expect(times[1]).toBeCloseTo(times[0] + 0.7, 3);
    expect(times[2]).toBeCloseTo(times[1] + 0.7, 3);
    expect(context.createBuffer).toHaveBeenCalledTimes(3);
    sources.at(-1).onended();
    await playing;
  });

  it('keeps whole 16-bit samples when a chunk ends in the middle of one', async () => {
    const { context, sources, player } = setup();
    const playing = player.play(streamOf([new Uint8Array(5), new Uint8Array(5)]).response); // 10 bytes = 5 samples
    await flush();
    expect(context.createBuffer.mock.calls.reduce((sum, call) => sum + call[1], 0)).toBe(5);
    sources.at(-1).onended();
    await playing;
  });

  it('stop() ends playback, silences scheduled audio and cancels the download', async () => {
    const { sources, player } = setup();
    const { response, reader } = streamOf([]);
    reader.read.mockImplementationOnce(async () => ({ value: bytes(1), done: false })).mockImplementationOnce(() => new Promise(() => {}));
    const playing = player.play(response);
    await flush();
    expect(sources).toHaveLength(1);
    player.stop();
    await playing;
    expect(sources[0].stop).toHaveBeenCalled();
    expect(reader.cancel).toHaveBeenCalled();
    expect(player.isPlaying()).toBe(false);
  });

  it('stop() also ends a wait for a piece that has not arrived yet, and cancels the other pieces', async () => {
    const { sources, player } = setup();
    const never = new Promise(() => {});
    const second = { body: { cancel: vi.fn().mockResolvedValue() } };
    const playing = player.play([{ response: never }, { response: Promise.resolve(second) }]);
    await flush();
    player.stop();
    await playing;
    expect(sources).toHaveLength(0);
    await flush();
    expect(second.body.cancel).toHaveBeenCalled();
  });

  it('a new reply replaces the current one', async () => {
    const { sources, player } = setup();
    const first = player.play(streamOf([bytes(1)]).response);
    await flush();
    const second = player.play(streamOf([bytes(1)]).response);
    await first;
    expect(sources[0].stop).toHaveBeenCalled();
    await flush();
    sources.at(-1).onended();
    await second;
  });

  it('rejects when a piece fails to download, after the earlier pieces have played', async () => {
    const { sources, player } = setup();
    const failure = Object.assign(new Error('busy'), { status: 429, code: 'VOICE_BUSY' });
    const playing = player.play([
      { response: Promise.resolve(streamOf([bytes(0.7)]).response) },
      { response: Promise.reject(failure) },
    ]);
    const settled = playing.catch((error) => error);
    await flush();
    expect(sources).toHaveLength(1);
    expect(await settled).toBe(failure);
  });

  it('resumes a suspended audio context, and reads a plain body when streaming is unavailable', async () => {
    const { context, sources, player } = setup({ state: 'suspended' });
    const playing = player.play({ arrayBuffer: async () => bytes(0.5).buffer });
    await flush();
    expect(context.resume).toHaveBeenCalled();
    expect(sources).toHaveLength(1);
    sources[0].onended();
    await playing;
  });

  it('prime() creates and resumes the context from a click, and never throws', () => {
    const { context, player } = setup({ state: 'suspended' });
    player.prime();
    expect(context.resume).toHaveBeenCalled();
    expect(() => createPlayer({ AudioContextImpl: undefined }).prime()).not.toThrow();
  });

  it('reports playback failures as an Error', async () => {
    const player = createPlayer({ AudioContextImpl: class { constructor() { throw new Error('no audio'); } } });
    await expect(player.play({ arrayBuffer: async () => new ArrayBuffer(2) })).rejects.toThrow('Playback failed');
  });
});

describe('speech plan', () => {
  it('keeps a short reply as one piece', () => {
    expect(planSpeech('Done.')).toEqual(['Done.']);
    expect(planSpeech('')).toEqual([]);
    expect(planSpeech(undefined)).toEqual([]);
  });

  it('starts with a short first piece, then merges sentences into longer ones', () => {
    const text = 'I changed the width to 300 centimeters and the height to 250 centimeters. I also rescaled all three compartments so that the total width still adds up. Nothing is applied yet, so please review it.';
    const pieces = planSpeech(text);
    expect(pieces[0].length).toBeLessThanOrEqual(SPEECH_LIMITS.firstMax + 30);
    expect(pieces.length).toBeGreaterThanOrEqual(2);
    expect(pieces.join(' ').replace(/\s+/g, ' ')).toBe(text); // nothing is lost or reordered
    pieces.slice(1).forEach((piece) => expect(piece.length).toBeLessThanOrEqual(SPEECH_LIMITS.restMax));
  });

  it('does not split off a tiny remainder from a first sentence that is only slightly long', () => {
    const sentence = 'Resized the wardrobe to 300 centimeters wide and 250 tall.'; // 58 chars
    expect(planSpeech(`${sentence} Confirm it.`)).toEqual([sentence, 'Confirm it.']);
    const slightlyLong = 'Resized the wardrobe to 300 centimeters wide and 250 centimeters tall now.'; // 73 chars
    expect(planSpeech(slightlyLong)).toEqual([slightlyLong]);
  });

  it('does not split inside a decimal number or a sentence, and works for Hebrew', () => {
    expect(planSpeech('Make it 2.4 meters tall.')).toEqual(['Make it 2.4 meters tall.']);
    const hebrew = planSpeech('שיניתי את הרוחב ל-300 סנטימטר וגם את הגובה ל-250 סנטימטר. חילקתי מחדש את שלושת התאים כך שהרוחב הכולל ממשיך להתאים. שום דבר עוד לא הוחל.');
    expect(hebrew.length).toBeGreaterThanOrEqual(2);
    expect(hebrew[0].length).toBeLessThanOrEqual(SPEECH_LIMITS.firstMax + 30);
  });

  it('splits a very long sentence at spaces and caps the total spoken length at a sentence end', () => {
    const long = `${'word '.repeat(100)}end.`;
    planSpeech(long).forEach((piece) => expect(piece.length).toBeLessThanOrEqual(SPEECH_LIMITS.restMax));
    const huge = 'This is a sentence. '.repeat(200);
    const pieces = planSpeech(huge);
    const spoken = pieces.join(' ');
    expect(spoken.length).toBeLessThanOrEqual(SPEECH_LIMITS.totalMax);
    expect(spoken.endsWith('.')).toBe(true);
  });

  it('estimates the speaking time of a piece', () => {
    expect(estimateSeconds('x'.repeat(140))).toBe(10);
  });
});

describe('voice model', () => {
  function setup({ blobSize = 3000, transcript = { text: 'make it 240 cm wide', noSpeech: false } } = {}) {
    const recorder = {
      isSupported: () => true,
      start: vi.fn().mockResolvedValue(),
      stop: vi.fn().mockResolvedValue({ size: blobSize }),
      cancel: vi.fn(),
    };
    const api = { transcribeAudio: vi.fn().mockResolvedValue(transcript), speak: vi.fn().mockResolvedValue({ body: { cancel: vi.fn().mockResolvedValue() } }) };
    const player = { play: vi.fn(async (items) => { for (const item of items) await item.response; }), stop: vi.fn(), prime: vi.fn() };
    const onTranscript = vi.fn();
    const voice = createVoiceModel({ recorder, api, player, onTranscript });
    voice.setEnabled(true); // the Voice switch is off by default; most tests need it on
    return { recorder, api, player, onTranscript, voice };
  }

  it('records, transcribes and hands the text over (it never sends anything)', async () => {
    const { voice, api, onTranscript } = setup();
    await voice.toggle();
    expect(voice.getState().state).toBe('recording');
    await voice.toggle();
    expect(onTranscript).toHaveBeenCalledWith('make it 240 cm wide');
    expect(api.transcribeAudio).toHaveBeenCalledTimes(1);
    expect(voice.getState()).toMatchObject({ state: 'idle', error: null });
  });

  it('skips the server for taps and reports silence kindly', async () => {
    const tap = setup({ blobSize: 100 });
    await tap.voice.toggle();
    await tap.voice.toggle();
    expect(tap.api.transcribeAudio).not.toHaveBeenCalled();
    expect(tap.voice.getState().error).toBe('NO_SPEECH');
    const quiet = setup({ transcript: { text: '', noSpeech: true } });
    await quiet.voice.toggle();
    await quiet.voice.toggle();
    expect(quiet.onTranscript).not.toHaveBeenCalled();
    expect(quiet.voice.getState().error).toBe('NO_SPEECH');
  });

  it('shows a clear message when the mic is blocked and returns to idle', async () => {
    const { voice, recorder } = setup();
    recorder.start.mockRejectedValue(Object.assign(new Error('x'), { name: 'NotAllowedError' }));
    await voice.toggle();
    expect(voice.getState()).toMatchObject({ state: 'idle', error: 'DENIED' });
  });

  it('turns failures into codes (the panel shows them in the selected language)', () => {
    expect(describeVoiceError(new ApiError(429, 'VOICE_BUDGET', 'Voice is paused for today.'))).toBe('VOICE_BUDGET');
    expect(describeVoiceError(new ApiError(0, 'NETWORK', 'Could not reach the server.'))).toBe('NETWORK');
    expect(describeVoiceError(Object.assign(new Error('x'), { name: 'NotFoundError' }))).toBe('NO_MIC');
    expect(describeVoiceError(Object.assign(new Error('x'), { code: 'UNSUPPORTED' }))).toBe('UNSUPPORTED');
    expect(describeVoiceError(new Error('weird'))).toBe('FAILED');
  });

  it('ignores the mic while transcribing and cancel sends nothing', async () => {
    const { voice, recorder, api } = setup();
    let release;
    recorder.stop.mockReturnValue(new Promise((resolve) => { release = resolve; }));
    await voice.toggle();
    const stopping = voice.toggle();
    await flush();
    expect(voice.getState().state).toBe('transcribing');
    await voice.toggle();
    expect(recorder.start).toHaveBeenCalledTimes(1);
    release({ size: 3000 });
    await stopping;
    const second = setup();
    await second.voice.toggle();
    second.voice.cancel();
    expect(second.recorder.cancel).toHaveBeenCalled();
    expect(second.api.transcribeAudio).not.toHaveBeenCalled();
    expect(api.transcribeAudio).toHaveBeenCalledTimes(1);
  });

  it('is off by default: no microphone, no speech, until the Voice switch is turned on', async () => {
    const recorder = { isSupported: () => true, start: vi.fn(), stop: vi.fn(), cancel: vi.fn() };
    const api = { transcribeAudio: vi.fn(), speak: vi.fn() };
    const player = { play: vi.fn(), stop: vi.fn(), prime: vi.fn() };
    const voice = createVoiceModel({ recorder, api, player, onTranscript: vi.fn() });
    expect(voice.getState().enabled).toBe(false);
    await voice.toggle();
    await voice.speakReply('hello');
    expect(recorder.start).not.toHaveBeenCalled();
    expect(api.speak).not.toHaveBeenCalled();
    voice.setEnabled(true);
    expect(player.prime).toHaveBeenCalled(); // audio is unlocked by the click on the switch
    await voice.speakReply('hello');
    expect(api.speak).toHaveBeenCalledWith('hello');
  });

  it('reads every reply aloud while on, and a new recording or turning it off stops playback', async () => {
    const { voice, api, player, recorder } = setup();
    await voice.speakReply('Done.');
    expect(api.speak).toHaveBeenCalledWith('Done.');
    expect(player.play).toHaveBeenCalledTimes(1);
    await voice.toggle();
    expect(player.stop).toHaveBeenCalled();
    await voice.speakReply('while recording');
    expect(api.speak).toHaveBeenCalledTimes(1);
    voice.setEnabled(false); // turning it off drops the recording and sends nothing
    expect(recorder.cancel).toHaveBeenCalled();
    expect(voice.getState()).toMatchObject({ enabled: false, state: 'idle' });
    await voice.speakReply('off');
    expect(api.speak).toHaveBeenCalledTimes(1);
  });

  it('a playback failure is reported as PLAYBACK', async () => {
    const { voice, player } = setup();
    player.play.mockRejectedValue(new Error('blocked'));
    await voice.speakReply('hello');
    expect(voice.getState().error).toBe('PLAYBACK');
  });

  it('a failed spoken reply shows a note but never throws', async () => {
    const { voice, api } = setup();
    api.speak.mockRejectedValue(new ApiError(429, 'VOICE_BUDGET', 'Voice is paused for today. You can keep typing.'));
    await voice.speakReply('hello');
    expect(voice.getState()).toMatchObject({ speaking: false, error: 'VOICE_BUDGET' });
  });

  it('requests every piece of a long reply at once and plays them in order', async () => {
    const { voice, api, player } = setup();
    const reply = 'I changed the width to 300 centimeters and the height to 250 centimeters. I also rescaled all three compartments so that the total width still adds up. Nothing is applied yet, so please review it.';
    await voice.speakReply(reply);
    expect(api.speak.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(player.play).toHaveBeenCalledTimes(1);
    const items = player.play.mock.calls[0][0];
    expect(items).toHaveLength(api.speak.mock.calls.length);
    items.forEach((item) => expect(item.expectedSeconds).toBeGreaterThan(0));
  });

  it('a newer reply stops the one that is playing', async () => {
    const { voice, player } = setup();
    let release;
    player.play.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const first = voice.speakReply('one');
    await flush();
    const second = voice.speakReply('two');
    expect(player.stop).toHaveBeenCalled();
    release();
    await Promise.all([first, second]);
    expect(voice.getState().speaking).toBe(false);
  });
});

describe('chat model with voice', () => {
  it('offers every assistant reply for speaking, typed or dictated (the voice switch decides)', async () => {
    const onAssistantReply = vi.fn();
    const agent = vi.fn().mockResolvedValue({ reply: 'Wider.', proposal: null });
    const model = createChatModel({ getRevision: () => 1, getDesign: () => ({}), agent, onAssistantReply });
    model.send('typed');
    await flush();
    expect(onAssistantReply).toHaveBeenCalledWith('Wider.');
    model.send('dictated');
    await flush();
    expect(onAssistantReply).toHaveBeenCalledTimes(2);
  });

  it('never speaks system notes or errors', async () => {
    const onAssistantReply = vi.fn();
    const agent = vi.fn().mockRejectedValue(new Error('down'));
    const model = createChatModel({ getRevision: () => 1, getDesign: () => ({}), agent, onAssistantReply });
    model.send('hello');
    await flush();
    model.note('Last change undone.');
    expect(onAssistantReply).not.toHaveBeenCalled();
  });
});

describe('voice api client', () => {
  it('posts the recording as a raw body and returns the transcript', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true, data: { text: 'hi', noSpeech: false } }) });
    const blob = new Blob(['a'], { type: 'audio/webm' });
    await expect(transcribeAudio(blob, 'he', fetchImpl)).resolves.toEqual({ text: 'hi', noSpeech: false });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://localhost:8000/api/voice/transcribe?language=he');
    expect(init.body).toBe(blob);
    expect(init.headers['Content-Type']).toBe('audio/webm');
  });

  it('turns server and network failures into ApiError', async () => {
    const down = vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({ success: false, error: { code: 'VOICE_BUDGET', message: 'Voice is paused for today.' } }) });
    await expect(transcribeAudio(new Blob(['a']), undefined, down)).rejects.toMatchObject({ status: 429, code: 'VOICE_BUDGET' });
    await expect(speak('hi', vi.fn().mockRejectedValue(new Error('x')))).rejects.toMatchObject({ code: 'NETWORK' });
  });

  it('speak returns the streaming response', async () => {
    const reply = { ok: true, status: 200, body: {} };
    const fetchImpl = vi.fn().mockResolvedValue(reply);
    await expect(speak('Done.', fetchImpl)).resolves.toBe(reply);
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ text: 'Done.' });
  });
});
