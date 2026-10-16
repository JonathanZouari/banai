// Voice view-model (no DOM): record -> transcribe -> hand the text to the composer, and read
// replies aloud. Voice only produces text for the composer and sound for replies. It never sends
// a message, confirms a proposal or changes the design.
// Errors are stored as codes; the panel turns them into text in the selected language.
import { estimateSeconds, planSpeech } from './speechPlan.js';

export function describeVoiceError(error) {
  if (error?.code === 'UNSUPPORTED') return 'UNSUPPORTED';
  if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') return 'DENIED';
  if (error?.name === 'NotFoundError' || error?.name === 'OverconstrainedError') return 'NO_MIC';
  if (error?.code === 'NO_SPEECH') return 'NO_SPEECH';
  if (error?.status !== undefined && error?.code) return error.code; // an API error: VOICE_BUDGET, NETWORK, ...
  return 'FAILED';
}

export function createVoiceModel({ recorder, api, player, onTranscript, minBytes = 800 }) {
  let state = 'idle'; // idle | recording | transcribing
  let speaking = false;
  let enabled = false; // the Voice switch: when on, the mic is available and every reply is read aloud
  let error = null;
  let speakToken = 0;
  const listeners = new Set();
  const notify = () => listeners.forEach((listener) => listener());
  const fail = (cause) => { error = describeVoiceError(cause); };

  async function stopAndTranscribe() {
    if (state !== 'recording') return;
    state = 'transcribing';
    notify();
    try {
      const blob = await recorder.stop();
      if (!blob || blob.size < minBytes) throw Object.assign(new Error('too short'), { code: 'NO_SPEECH' });
      const { text, noSpeech } = await api.transcribeAudio(blob);
      if (noSpeech || !text) throw Object.assign(new Error('silence'), { code: 'NO_SPEECH' });
      onTranscript(text);
    } catch (cause) {
      fail(cause);
    } finally {
      state = 'idle';
      notify();
    }
  }

  function stopSpeaking() {
    speakToken += 1;
    player.stop();
    speaking = false;
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getState: () => ({ state, speaking, enabled, error }),
    isSupported: () => recorder.isSupported(),

    /** Mic button: start recording, or stop and transcribe. Ignored while transcribing. */
    async toggle() {
      if (!enabled || state === 'transcribing') return;
      if (state === 'recording') {
        await stopAndTranscribe();
        return;
      }
      error = null;
      stopSpeaking();
      state = 'recording';
      notify();
      try {
        await recorder.start(() => { stopAndTranscribe(); });
      } catch (cause) {
        fail(cause);
        state = 'idle';
        notify();
      }
    },

    /** Escape or a hidden tab: drop the recording and send nothing. */
    cancel() {
      if (state !== 'recording') return;
      recorder.cancel();
      state = 'idle';
      notify();
    },

    clearError() {
      error = null;
      notify();
    },

    /** The Voice switch. Turning it on primes the audio output (a click is needed); off stops everything. */
    setEnabled(value) {
      enabled = Boolean(value);
      error = null;
      if (enabled) player.prime?.();
      else {
        if (state === 'recording') {
          recorder.cancel();
          state = 'idle';
        }
        stopSpeaking();
      }
      notify();
    },

    /**
     * Read an assistant reply aloud (when Voice is on). The reply is cut into short pieces that are
     * requested together and played in order. A newer reply or a new recording replaces it.
     */
    async speakReply(text) {
      const pieces = planSpeech(text);
      if (!enabled || pieces.length === 0 || state !== 'idle') return;
      stopSpeaking();
      const mine = speakToken;
      speaking = true;
      notify();
      const requests = pieces.map((piece) => Promise.resolve().then(() => api.speak(piece)));
      requests.forEach((request) => request.catch(() => {})); // an unplayed failure is reported once, below
      try {
        await player.play(requests.map((response, i) => ({ response, expectedSeconds: estimateSeconds(pieces[i]) })));
      } catch (cause) {
        if (mine === speakToken) error = cause?.code && cause?.status !== undefined ? describeVoiceError(cause) : 'PLAYBACK';
      } finally {
        if (mine === speakToken) speaking = false;
        notify();
      }
    },
  };
}
