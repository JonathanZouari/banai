import { describe, expect, it, vi } from 'vitest';
import { speakText, transcribeAudio } from '../../src/api/client.js';

describe('voice calls', () => {
  it('posts the recording as raw audio and returns the transcript', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true, data: { text: 'hello' } }) });
    const blob = new Blob(['abc'], { type: 'audio/webm' });
    await expect(transcribeAudio(blob, fetchImpl)).resolves.toBe('hello');
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://localhost:8000/api/voice/transcribe');
    expect(init.headers['Content-Type']).toBe('audio/webm');
    expect(init.body).toBe(blob);
  });

  it('carries the server error code and status for transcription failures', async () => {
    const body = { success: false, error: { code: 'NO_SPEECH', message: 'x' } };
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 422, json: async () => body });
    await expect(transcribeAudio(new Blob(['a'], { type: 'audio/webm' }), fetchImpl)).rejects.toMatchObject({ status: 422, code: 'NO_SPEECH' });
    await expect(transcribeAudio(new Blob(['a']), vi.fn().mockRejectedValue(new Error('x')))).rejects.toMatchObject({ code: 'NETWORK' });
  });

  it('posts text to speak and returns the audio blob', async () => {
    const audio = new Blob(['mp3']);
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, blob: async () => audio });
    await expect(speakText('Hi there', fetchImpl)).resolves.toBe(audio);
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ text: 'Hi there' });
    await expect(speakText('x', vi.fn().mockResolvedValue({ ok: false, status: 503 }))).rejects.toMatchObject({ status: 503 });
  });
});
