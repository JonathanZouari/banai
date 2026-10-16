// Voice view-model (no DOM): states idle -> recording -> transcribing -> idle, plus speaking replies aloud.
// Voice only changes how a message is entered and read out. A transcript is sent through the normal chat
// (`sendText`), so scope rules, validation and the Confirm gate are exactly the same as for typing.

export const VOICE_MESSAGES = Object.freeze({
  denied: 'Microphone access was denied. Allow it in the browser to talk to the designer.',
  'no-device': 'No microphone was found.',
  unsupported: 'Voice is not supported in this browser.',
  'too-long': 'That recording was too long. Please keep it under 30 seconds.',
  failed: 'The recording failed. Please try again.',
  NO_SPEECH: 'I could not hear any speech. Please try again.',
  429: 'You are using voice too fast. Please wait a moment.',
  503: 'Voice is not available right now. You can type instead.',
  default: 'Voice did not work this time. You can type your message instead.',
});
export const MAX_SPOKEN_CHARS = 600;
export const SPEAK_STORAGE_KEY = 'banai.speakReplies';

const messageFor = (error) => VOICE_MESSAGES[error?.code] ?? VOICE_MESSAGES[error?.status] ?? VOICE_MESSAGES.default;

/** Text read aloud for an assistant turn: its reply plus the proposal's changes, cut to the server limit. */
export function spokenText(reply, changes = []) {
  const parts = [reply, ...changes.map((change) => `${change.title}. ${change.detail}`)];
  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().slice(0, MAX_SPOKEN_CHARS);
}

export function createVoiceModel({ recorder, transcribe, speak, play, sendText, storage = null }) {
  let state = 'idle'; // idle | recording | transcribing
  let speaking = false;
  let notice = '';
  let speakReplies = false;
  let player = null;
  let speakToken = 0;
  const listeners = new Set();
  const notify = () => listeners.forEach((listener) => listener());

  try {
    speakReplies = storage?.getItem(SPEAK_STORAGE_KEY) === '1';
  } catch {
    speakReplies = false;
  }

  const set = (patch) => {
    if ('state' in patch) state = patch.state;
    if ('notice' in patch) notice = patch.notice;
    notify();
  };

  function stopSpeaking() {
    speakToken += 1;
    if (player) {
      player.stop();
      player = null;
    }
    if (speaking) {
      speaking = false;
      notify();
    }
  }

  // Shared by the second press and by the recorder's time limit: transcribe the finished recording and send it.
  async function finishRecording(pendingAudio) {
    if (state === 'transcribing') return;
    set({ state: 'transcribing', notice: '' });
    try {
      const text = await transcribe(await pendingAudio);
      const sent = sendText(text);
      set({ state: 'idle', notice: sent.ok ? '' : 'Please wait for the designer to answer first.' });
    } catch (error) {
      set({ state: 'idle', notice: messageFor(error) });
    }
  }
  if (typeof recorder.onLimit === 'function') recorder.onLimit(finishRecording);

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getState: () => ({ state, speaking, notice, speakReplies }),

    /** Press once to start recording, press again to stop and send. */
    async toggleRecording() {
      if (state === 'transcribing') return;
      if (state === 'recording') {
        await finishRecording(recorder.stop());
        return;
      }
      stopSpeaking(); // never record the designer talking
      try {
        await recorder.start();
        set({ state: 'recording', notice: '' });
      } catch (error) {
        set({ state: 'idle', notice: messageFor(error) });
      }
    },

    setSpeakReplies(enabled) {
      speakReplies = Boolean(enabled);
      try {
        storage?.setItem(SPEAK_STORAGE_KEY, speakReplies ? '1' : '0');
      } catch {
        // storage is only a convenience
      }
      if (!speakReplies) stopSpeaking();
      notify();
    },

    /** Read an assistant turn aloud when "read replies" is on. Failures are silent: the text is on screen. */
    async speakReply(text) {
      if (!speakReplies || !text) return;
      stopSpeaking();
      const token = speakToken;
      speaking = true;
      notify();
      try {
        const audio = await speak(text.slice(0, MAX_SPOKEN_CHARS));
        if (token !== speakToken) return; // superseded by a newer reply, a recording or the toggle
        player = play(audio, () => {
          if (token === speakToken) {
            player = null;
            speaking = false;
            notify();
          }
        });
      } catch {
        if (token === speakToken) {
          speaking = false;
          notify();
        }
      }
    },

    stopSpeaking,
  };
}
