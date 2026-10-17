// Spoken replies (ADR-028). When the customer speaks to בנאי, the reply is also read aloud by an
// AI voice: young, warm and smiling (the persona is set on the server, app/agent/speech.py). A typed
// message gets a silent reply. The speaker button mutes it, and the choice and the voice are kept in
// this browser. Pressing the mic or sending a new message stops the voice at once. The voice only
// talks: a design change still waits for a tap on Confirm.
//
// No DOM here: prefs, the player and the messages are unit-tested with fakes.

/** OpenAI's built-in voices (checked 2026-10-17); marin and cedar are its recommended pair. */
export const VOICES = Object.freeze(['cedar', 'marin', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse', 'alloy']);
export const DEFAULT_VOICE = 'cedar';
export const RECOMMENDED_VOICES = Object.freeze(['cedar', 'marin']);
export const SAMPLE_TEXT = 'היי, אני בנאי. בואו נתכנן יחד ארון שמתאים בדיוק לכם.';
/** OpenAI's usage policies ask for a clear disclosure that the voice is AI-generated. */
export const AI_VOICE_DISCLOSURE = 'קול שנוצר ב-AI';
export const MAX_SPEAK_CHARS = 4000; // the server's input cap; it speaks at most ~1200 of them

const ENABLED_KEY = 'banai.speech.enabled';
const VOICE_KEY = 'banai.speech.voice';

// The server's messages are English; the chat speaks Hebrew, so errors are shown by code.
const SPEECH_ERRORS = Object.freeze({
  INVALID_FORMAT: 'כדי לשמוע את בנאי, הוסיפו מפתח OpenAI בהגדרות AI.',
  INVALID_KEY: 'OpenAI דחה את המפתח. בדקו אותו בהגדרות AI.',
  MODEL_UNAVAILABLE: 'למפתח שלכם אין גישה למודל הקול. התשובה מופיעה בכתב.',
  OPENAI_RATE_LIMIT: 'OpenAI מגביל כרגע את המפתח הזה. התשובה מופיעה בכתב.',
  BUSY: 'הקול עמוס כרגע. התשובה מופיעה בכתב.',
  PLAYBACK: 'הדפדפן לא השמיע את הקול. התשובה מופיעה בכתב.',
});
export const speechErrorMessage = (code) => (Object.hasOwn(SPEECH_ERRORS, code ?? '') ? SPEECH_ERRORS[code] : 'לא הצלחנו להקריא את התשובה. היא מופיעה בכתב.');

/** Whether replies are spoken (default on) and which voice, kept in this browser. Storage may be blocked. */
export function createSpeechPrefs(storage = globalThis.localStorage) {
  const read = (key) => {
    try {
      return storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  };
  const write = (key, value) => {
    try {
      storage?.setItem(key, value);
    } catch {
      // the choice then lasts until the page closes
    }
  };
  const stored = read(VOICE_KEY);
  let enabled = read(ENABLED_KEY) !== 'false';
  let voice = VOICES.includes(stored) ? stored : DEFAULT_VOICE;
  const listeners = new Set();
  const notify = () => listeners.forEach((listener) => listener({ enabled, voice }));
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    isEnabled: () => enabled,
    getVoice: () => voice,
    setEnabled(next) {
      enabled = Boolean(next);
      write(ENABLED_KEY, String(enabled));
      notify();
    },
    setVoice(next) {
      if (!VOICES.includes(next)) return false;
      voice = next;
      write(VOICE_KEY, voice);
      notify();
      return true;
    },
  };
}

/**
 * Plays one reply at a time. `synthesize(text, voice, { signal }) -> Promise<Blob>` (the server call),
 * `createAudio()` an HTMLAudioElement, `urls` the URL API. A newer speak() or stop() cancels an older one,
 * even while its audio is still being made (the request is aborted), so a late answer never talks over
 * the customer and no unwanted audio is paid for.
 * state: 'idle' | 'loading' | 'playing'.
 */
export function createSpeaker({ synthesize, createAudio = () => new Audio(), urls = globalThis.URL, onError = () => {} }) {
  let token = 0;
  let audio = null;
  let url = null;
  let pending = null; // AbortController of the request still being made
  let state = 'idle';
  const listeners = new Set();
  const set = (next) => {
    if (next === state) return;
    state = next;
    listeners.forEach((listener) => listener(state));
  };
  const release = () => {
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      try {
        audio.pause();
      } catch {
        // already stopped
      }
      audio = null;
    }
    if (url) {
      urls.revokeObjectURL(url);
      url = null;
    }
  };
  const stop = () => {
    token += 1;
    pending?.abort();
    pending = null;
    release();
    set('idle');
  };

  async function speak(text, voice = DEFAULT_VOICE) {
    const clean = String(text ?? '').trim().slice(0, MAX_SPEAK_CHARS);
    stop();
    if (!clean) return false;
    const mine = token;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    pending = controller;
    set('loading');
    let blob;
    try {
      blob = await synthesize(clean, voice, { signal: controller?.signal });
    } catch (error) {
      if (mine === token) {
        pending = null;
        set('idle');
        onError(error);
      }
      return false;
    }
    if (mine !== token) return false; // stopped or replaced while the audio was being made
    pending = null;
    url = urls.createObjectURL(blob);
    audio = createAudio();
    audio.onended = () => {
      if (mine === token) stop();
    };
    audio.onerror = () => {
      if (mine !== token) return;
      stop();
      onError({ code: 'PLAYBACK' });
    };
    audio.src = url;
    try {
      await audio.play();
    } catch {
      if (mine === token) {
        stop();
        onError({ code: 'PLAYBACK' });
      }
      return false;
    }
    if (mine !== token) return false;
    set('playing');
    return true;
  }

  return {
    speak,
    stop,
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
