// Voice for the chat: a speaker that reads replies aloud and a recorder for the customer's speech.
// The speaker uses the server's ElevenLabs voice when it is configured and falls back to the
// browser's own voice (free, offline) when it is not or the call fails, e.g. the free quota ran out.
// Everything the browser provides is injectable, so the logic is unit-tested without devices.
import { speak as speakApi } from '../api/client.js';

const BROWSER_LANG = Object.freeze({ he: 'he-IL', en: 'en-US' });
export const MAX_RECORDING_MS = 30_000;

export function createSpeaker({
  serverVoice = false,
  speakApi: request = speakApi,
  createAudio = (url) => new Audio(url),
  synthesis = globalThis.speechSynthesis,
  Utterance = globalThis.SpeechSynthesisUtterance,
  urls = globalThis.URL,
} = {}) {
  let current = null; // { id, stop }
  const listeners = new Set();
  const notify = () => listeners.forEach((listener) => listener(current?.id ?? null));

  const finish = (id) => {
    if (current?.id !== id) return;
    current = null;
    notify();
  };

  function browserVoice(id, text, language) {
    if (!synthesis || !Utterance) return finish(id);
    const utterance = new Utterance(text);
    utterance.lang = BROWSER_LANG[language] ?? BROWSER_LANG.he;
    const voice = synthesis.getVoices?.().find((v) => v.lang?.toLowerCase().startsWith(language));
    if (voice) utterance.voice = voice;
    utterance.onend = () => finish(id);
    utterance.onerror = () => finish(id);
    current = { id, stop: () => synthesis.cancel() };
    synthesis.speak(utterance);
  }

  return {
    /** Read `text` aloud; `id` names what is playing (e.g. a message index) for the UI. */
    async speak(id, text, language) {
      this.stop();
      current = { id, stop: () => {} };
      notify();
      if (serverVoice) {
        try {
          const blob = await request({ text, language });
          if (current?.id !== id) return; // stopped or replaced while loading
          const url = urls.createObjectURL(blob);
          const audio = createAudio(url);
          const done = () => {
            urls.revokeObjectURL(url);
            finish(id);
          };
          audio.onended = done;
          audio.onerror = done;
          current = { id, stop: () => { audio.pause(); done(); } };
          await audio.play();
          return;
        } catch {
          if (current?.id !== id) return;
          // Fall through to the browser voice.
        }
      }
      browserVoice(id, text, language);
    },
    stop() {
      const playing = current;
      current = null;
      playing?.stop();
      if (playing) notify();
    },
    playing: () => current?.id ?? null,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** True when this browser can record audio for transcription. */
export const canRecord = (env = globalThis) => Boolean(env.MediaRecorder && env.navigator?.mediaDevices?.getUserMedia);

/** Records one clip at a time. `stop()` resolves to the recorded Blob (or null if nothing was recorded). */
export function createRecorder({ env = globalThis, maxMs = MAX_RECORDING_MS } = {}) {
  let session = null;

  return {
    recording: () => session !== null,
    async start() {
      if (session) return;
      const stream = await env.navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg', 'audio/mp4']
        .find((candidate) => env.MediaRecorder.isTypeSupported?.(candidate)) ?? '';
      const recorder = new env.MediaRecorder(stream, type ? { mimeType: type } : undefined);
      const chunks = [];
      let resolveStop;
      const stopped = new Promise((resolve) => { resolveStop = resolve; });
      recorder.ondataavailable = (event) => { if (event.data?.size) chunks.push(event.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop()); // release the microphone
        const mimeType = (recorder.mimeType || type || 'audio/webm').split(';')[0];
        resolveStop(chunks.length ? new Blob(chunks, { type: mimeType }) : null);
      };
      const timer = setTimeout(() => recorder.state !== 'inactive' && recorder.stop(), maxMs);
      session = { recorder, stopped, timer };
      recorder.start();
    },
    async stop() {
      if (!session) return null;
      const { recorder, stopped, timer } = session;
      clearTimeout(timer);
      if (recorder.state !== 'inactive') recorder.stop();
      const blob = await stopped;
      session = null;
      return blob;
    },
    /** Wait for an automatic stop (time limit) as well as a manual one. */
    whenStopped: () => session?.stopped ?? Promise.resolve(null),
  };
}
