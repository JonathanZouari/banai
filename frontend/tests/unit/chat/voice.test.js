import { describe, expect, it, vi } from 'vitest';
import { speak, transcribe } from '../../../src/api/client.js';
import { canRecord, createRecorder, createSpeaker } from '../../../src/chat/voice.js';

function fakeSynthesis() {
  const spoken = [];
  return {
    spoken,
    getVoices: () => [{ lang: 'he-IL', name: 'Asaf' }, { lang: 'en-US', name: 'Zira' }],
    speak: (utterance) => spoken.push(utterance),
    cancel: vi.fn(),
  };
}

class FakeUtterance {
  constructor(text) { this.text = text; }
}

function fakeAudio() {
  const audio = { play: vi.fn(async () => {}), pause: vi.fn(), onended: null, onerror: null };
  return audio;
}

const urls = { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() };

describe('speaker', () => {
  it('plays the server voice when it is configured', async () => {
    const audio = fakeAudio();
    const request = vi.fn(async () => new Blob(['mp3']));
    const synthesis = fakeSynthesis();
    const speaker = createSpeaker({ serverVoice: true, speakApi: request, createAudio: () => audio, synthesis, Utterance: FakeUtterance, urls });
    await speaker.speak(3, 'שלום', 'he');
    expect(request).toHaveBeenCalledWith({ text: 'שלום', language: 'he' });
    expect(audio.play).toHaveBeenCalled();
    expect(speaker.playing()).toBe(3);
    expect(synthesis.spoken).toEqual([]);
    audio.onended();
    expect(speaker.playing()).toBeNull();
    expect(urls.revokeObjectURL).toHaveBeenCalledWith('blob:x');
  });

  it('falls back to the browser Hebrew voice when the server voice fails (e.g. quota used up)', async () => {
    const synthesis = fakeSynthesis();
    const speaker = createSpeaker({ serverVoice: true, speakApi: async () => { throw new Error('502'); }, synthesis, Utterance: FakeUtterance, urls });
    await speaker.speak(1, 'מדף חדש', 'he');
    expect(synthesis.spoken).toHaveLength(1);
    expect(synthesis.spoken[0].lang).toBe('he-IL');
    expect(synthesis.spoken[0].voice.name).toBe('Asaf');
  });

  it('uses only the browser voice when the server has none, and stop() silences it', async () => {
    const synthesis = fakeSynthesis();
    const request = vi.fn();
    const speaker = createSpeaker({ serverVoice: false, speakApi: request, synthesis, Utterance: FakeUtterance, urls });
    const changes = [];
    speaker.subscribe((id) => changes.push(id));
    await speaker.speak(2, 'Hello', 'en');
    expect(request).not.toHaveBeenCalled();
    expect(synthesis.spoken[0].lang).toBe('en-US');
    speaker.stop();
    expect(synthesis.cancel).toHaveBeenCalled();
    expect(speaker.playing()).toBeNull();
    expect(changes).toEqual([2, null]);
  });
});

describe('recorder', () => {
  function fakeEnv() {
    const track = { stop: vi.fn() };
    class FakeMediaRecorder {
      static isTypeSupported = (type) => type === 'audio/webm';
      constructor(stream, options) { this.mimeType = options?.mimeType ?? ''; this.state = 'inactive'; }
      start() { this.state = 'recording'; }
      stop() {
        this.state = 'inactive';
        this.ondataavailable({ data: new Blob(['opus'], { type: 'audio/webm' }) });
        this.onstop();
      }
    }
    return {
      track,
      env: {
        MediaRecorder: FakeMediaRecorder,
        navigator: { mediaDevices: { getUserMedia: vi.fn(async () => ({ getTracks: () => [track] })) } },
      },
    };
  }

  it('records a clip, returns it as a Blob and releases the microphone', async () => {
    const { env, track } = fakeEnv();
    expect(canRecord(env)).toBe(true);
    const recorder = createRecorder({ env });
    await recorder.start();
    expect(recorder.recording()).toBe(true);
    const blob = await recorder.stop();
    expect(blob.type).toBe('audio/webm');
    expect(blob.size).toBeGreaterThan(0);
    expect(track.stop).toHaveBeenCalled();
    expect(recorder.recording()).toBe(false);
  });

  it('stops by itself at the time limit', async () => {
    vi.useFakeTimers();
    try {
      const { env } = fakeEnv();
      const recorder = createRecorder({ env, maxMs: 1000 });
      await recorder.start();
      const stopped = recorder.whenStopped();
      vi.advanceTimersByTime(1000);
      expect(await stopped).toBeInstanceOf(Blob);
    } finally {
      vi.useRealTimers();
    }
  });

  it('is unavailable without MediaRecorder', () => {
    expect(canRecord({ navigator: {} })).toBe(false);
  });
});

describe('voice API client', () => {
  it('speak posts the text and returns the audio blob', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, blob: async () => new Blob(['mp3'], { type: 'audio/mpeg' }) }));
    const blob = await speak({ text: 'hi', language: 'en' }, fetchImpl);
    expect(blob.type).toBe('audio/mpeg');
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toMatch(/\/api\/voice\/speak$/);
    expect(JSON.parse(init.body)).toEqual({ text: 'hi', language: 'en' });
  });

  it('speak turns an error status into an ApiError', async () => {
    const fetchImpl = async () => ({ ok: false, status: 503 });
    await expect(speak({ text: 'hi', language: 'en' }, fetchImpl)).rejects.toMatchObject({ status: 503, code: 'VOICE_ERROR' });
  });

  it('transcribe sends the raw recording with its type and returns the text', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ success: true, data: { text: 'שלום' } }) }));
    const audio = new Blob(['opus'], { type: 'audio/webm' });
    expect(await transcribe(audio, 'he', fetchImpl)).toEqual({ text: 'שלום' });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toMatch(/\/api\/voice\/transcribe\?language=he$/);
    expect(init.headers['Content-Type']).toBe('audio/webm');
    expect(init.body).toBe(audio);
  });
});
