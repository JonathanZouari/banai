// Push-to-talk for the chat composer. Hold the mic to speak, release to send, drag away to cancel; a
// short tap toggles hands-free recording and a second tap sends. Space or Enter works like a tap and
// Escape cancels. The browser records with MediaRecorder and the backend transcribes (OpenAI). The
// transcript goes through send(), the same path as typed text, so any design change still waits for
// the customer's confirmation: voice is only an input method.
//
// The pure parts (the gesture state machine, MIME choice, level, checks and error texts) are exported
// for unit tests. createPushToTalk() runs recordings against an injected environment, and
// bindPushToTalk() wires it to the real button, microphone and DOM.

import { ct } from './chatI18n.js';

export const CANCEL_DISTANCE_PX = 60;
export const TAP_MS = 220; // a shorter press is a tap: it starts hands-free recording
export const MIN_RECORDING_MS = 600;
export const MAX_RECORDING_MS = 30_000;
export const MAX_AUDIO_BYTES = 1024 * 1024; // the backend's cap (backend/app/api/voice.py)
export const AUDIO_BITS_PER_SECOND = 64_000; // 30 s of Opus is about 240 KB
export const SILENCE_LEVEL = 0.02; // a peak below this on the meter means the microphone heard nothing
const MIN_LEVEL_SAMPLES = 5; // fewer samples (no meter, a suspended audio graph) skip the silence check
const STOP_TIMEOUT_MS = 2000;
const CLOCK_MS = 250;
const AUDIO_CONSTRAINTS = { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } };

/** Opus in WebM first (Chrome, Firefox, Edge), then Ogg (Firefox), then MP4/AAC (Safari). */
export const MIME_CANDIDATES = Object.freeze(['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']);

/** The first candidate MediaRecorder supports, or '' to let the browser choose. */
export function pickMimeType(isTypeSupported) {
  if (typeof isTypeSupported !== 'function') return '';
  const supported = (type) => {
    try {
      return Boolean(isTypeSupported(type));
    } catch {
      return false;
    }
  };
  return MIME_CANDIDATES.find(supported) ?? '';
}

// The server's messages are English and may come from OpenAI, so errors are shown by code only.
export const VOICE_MESSAGES = Object.freeze({
  NO_PERMISSION: 'אין הרשאה למיקרופון. אפשרו גישה למיקרופון בהגדרות הדפדפן ונסו שוב.',
  NO_MICROPHONE: 'לא נמצא מיקרופון. חברו מיקרופון ונסו שוב.',
  MIC_BUSY: 'לא הצלחנו להפעיל את המיקרופון. ייתכן שתוכנה אחרת משתמשת בו.',
  UNSUPPORTED: 'הדפדפן הזה לא תומך בהקלטת קול. אפשר להקליד את ההודעה.',
  TOO_SHORT: 'ההקלטה קצרה מדי. החזיקו את המיקרופון בזמן שאתם מדברים.',
  NO_SPEECH: 'לא נשמע דיבור. נסו שוב קרוב יותר למיקרופון.',
  TOO_LONG: 'ההקלטה ארוכה מדי. נסו הודעה קצרה יותר.',
  FAILED: 'התמלול נכשל. נסו שוב.',
  INVALID_FORMAT: 'כדי לדבר עם בוב, הוסיפו מפתח OpenAI תקין בהגדרות AI.',
  INVALID_KEY: 'OpenAI דחה את המפתח. בדקו אותו בהגדרות AI.',
  MODEL_UNAVAILABLE: 'למפתח שלכם אין גישה למודל התמלול.',
  OPENAI_RATE_LIMIT: 'OpenAI מגביל כרגע את המפתח הזה, או שהמכסה נגמרה. נסו שוב מאוחר יותר.',
  BUSY: 'התמלול עמוס כרגע. נסו שוב בעוד רגע.',
  UNSUPPORTED_MEDIA: 'פורמט ההקלטה של הדפדפן הזה לא נתמך. אפשר להקליד את ההודעה.',
});
const CODE_ALIASES = Object.freeze({ EMPTY_AUDIO: 'TOO_SHORT', PAYLOAD_TOO_LARGE: 'TOO_LONG', UPSTREAM: 'FAILED' });
// getUserMedia and MediaRecorder fail with DOMExceptions, told apart by name (their numeric `code` is legacy).
const MIC_ERRORS = Object.freeze({
  NotAllowedError: 'NO_PERMISSION',
  PermissionDeniedError: 'NO_PERMISSION',
  SecurityError: 'NO_PERMISSION',
  NotFoundError: 'NO_MICROPHONE',
  DevicesNotFoundError: 'NO_MICROPHONE',
  OverconstrainedError: 'NO_MICROPHONE',
  NotReadableError: 'MIC_BUSY',
  TrackStartError: 'MIC_BUSY',
  AbortError: 'MIC_BUSY',
  NotSupportedError: 'UNSUPPORTED',
});

/** The message key for an error. `stage` is 'mic' (starting the recording) or 'transcribe'. */
export function voiceErrorCode(error, stage = 'transcribe') {
  if (stage === 'mic') return MIC_ERRORS[error?.name] ?? (error?.code === 'UNSUPPORTED' ? 'UNSUPPORTED' : 'MIC_BUSY');
  const code = typeof error?.code === 'string' ? (CODE_ALIASES[error.code] ?? error.code) : '';
  return Object.hasOwn(VOICE_MESSAGES, code) ? code : 'FAILED';
}

/** The Hebrew text for an error. Never the error's own message. */
export const voiceErrorMessage = (error, stage = 'transcribe') => ct(VOICE_MESSAGES[voiceErrorCode(error, stage)]);

/** RMS level of 8-bit time-domain samples (128 is silence), scaled to 0..1 for the meter. */
export function levelFromSamples(samples) {
  if (!samples?.length) return 0;
  let sum = 0;
  for (const value of samples) {
    const x = (value - 128) / 128;
    sum += x * x;
  }
  return Math.min(1, Math.sqrt(sum / samples.length) * 4);
}

/** Why a finished recording should not be sent, as a message key, or null. `peak` is null when unmeasured. */
export function recordingProblem({ durationMs, bytes, peak = null }) {
  if (!(durationMs >= MIN_RECORDING_MS) || !bytes) return 'TOO_SHORT';
  if (bytes > MAX_AUDIO_BYTES) return 'TOO_LONG';
  if (peak !== null && peak < SILENCE_LEVEL) return 'NO_SPEECH';
  return null;
}

export const IDLE = Object.freeze({ phase: 'idle' });
export const isRecording = (state) => state.phase === 'hold' || state.phase === 'free';
const unchanged = (state) => ({ state, effect: null });
const BUSY = Object.freeze({ phase: 'busy' });
const endHold = (state) => (state.armed ? { state: IDLE, effect: 'cancel' } : { state: BUSY, effect: 'send' });

/**
 * The gesture state machine (pure). Phases: idle -> hold (pointer down) or free (hands-free) ->
 * busy (transcribing) -> idle. Events: press/move/release {x, y, at}, key (Space/Enter), lost (the
 * pointer can no longer be released here), escape, hidden, limit, fail, done.
 * Returns { state, effect }; effect is 'start' | 'send' | 'cancel' | 'arm' | 'disarm' | 'free' | null.
 */
export function step(state, event) {
  const { phase } = state;
  switch (event.type) {
    case 'press':
      if (phase === 'idle') return { state: { phase: 'hold', x: event.x, y: event.y, at: event.at, armed: false }, effect: 'start' };
      if (phase === 'free') return { state: BUSY, effect: 'send' };
      if (phase === 'hold') return endHold(state); // the release was lost (it happened outside the page)
      return unchanged(state);
    case 'move': {
      if (phase !== 'hold') return unchanged(state);
      const armed = Math.hypot(event.x - state.x, event.y - state.y) > CANCEL_DISTANCE_PX;
      return armed === state.armed ? unchanged(state) : { state: { ...state, armed }, effect: armed ? 'arm' : 'disarm' };
    }
    case 'release':
      if (phase !== 'hold') return unchanged(state);
      if (!state.armed && event.at - state.at < TAP_MS) return { state: { phase: 'free' }, effect: 'free' };
      return endHold(state);
    case 'key':
      if (phase === 'idle') return { state: { phase: 'free' }, effect: 'start' };
      return isRecording(state) ? { state: BUSY, effect: 'send' } : unchanged(state);
    case 'lost':
      return phase === 'hold' ? { state: IDLE, effect: 'cancel' } : unchanged(state);
    case 'escape':
    case 'hidden':
      return isRecording(state) ? { state: IDLE, effect: 'cancel' } : unchanged(state);
    case 'limit':
      return isRecording(state) ? { state: BUSY, effect: 'send' } : unchanged(state);
    case 'fail':
      return isRecording(state) ? { state: IDLE, effect: null } : unchanged(state);
    case 'done':
      return phase === 'busy' ? { state: IDLE, effect: null } : unchanged(state);
    default:
      return unchanged(state);
  }
}

/** The hint under the meter for a state. */
export function hintFor(state) {
  if (state.phase === 'hold') return ct(state.armed ? 'שחררו כדי לבטל' : 'שחררו לשליחה · גררו לביטול');
  if (state.phase === 'free') return ct('מקליט. לחצו שוב כדי לשלוח');
  if (state.phase === 'busy') return ct('מתמלל…');
  return '';
}

/** Elapsed recording time as m:ss. */
export function formatClock(ms) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * Hands the transcript to send(). When send() refuses it (the agent is still answering, or the text
 * is too long), the transcript waits in the composer instead of being lost.
 */
export function deliverTranscript(text, { send, input, toast }) {
  const result = send(text);
  if (result?.ok !== false) return true;
  input.value = input.value.trim() ? `${input.value.trimEnd()} ${text}` : text;
  input.dispatchEvent?.(new Event('input', { bubbles: true }));
  input.focus?.();
  toast(ct(result.reason === 'busy' ? 'בוב עוד עונה. ההודעה הקולית מחכה בתיבה.' : 'ההודעה הקולית מחכה בתיבה. ערכו אותה ושלחו.'));
  return false;
}

const quietly = (action) => {
  try {
    const result = action();
    result?.catch?.(() => {});
  } catch {
    // best effort: the device or the browser already released it
  }
};

/**
 * Runs push-to-talk recordings. `env` is the browser (see browserEnv) or a fake; `view` renders
 * ({ render(state), level(value), elapsed(ms) }, all optional). `transcribe(blob, mimeType)` returns
 * the text; `deliver(text)` passes it on. Returns { dispatch(event), getState(), dispose() }.
 */
export function createPushToTalk({ env, transcribe, deliver, toast: show, view = {} }) {
  const toast = (message) => show(ct(message)); // the session language (ADR-029)
  let state = IDLE;
  let session = null;
  let disposed = false;

  function dispatch(event) {
    if (disposed) return state;
    const result = step(state, event);
    const changed = result.state !== state;
    state = result.state;
    if (changed) view.render?.(state);
    if (result.effect === 'start') begin();
    else if (result.effect === 'send') finish(true);
    else if (result.effect === 'cancel') finish(false);
    return state;
  }

  function begin() {
    const current = { chunks: [], peak: 0, samples: 0, startedAt: 0, mimeType: '' };
    session = current;
    if (!env.supported()) {
      fail(current, { code: 'UNSUPPORTED' });
      return;
    }
    // Created inside the press: browsers let only a user gesture start audio processing.
    try {
      current.ctx = env.createAudioContext();
      quietly(() => current.ctx?.resume?.());
    } catch {
      current.ctx = null;
    }
    Promise.resolve()
      .then(() => env.getUserMedia(AUDIO_CONSTRAINTS))
      .then((stream) => record(current, stream), (error) => fail(current, error));
  }

  function record(current, stream) {
    current.stream = stream;
    if (session !== current) {
      release(current); // released or cancelled while the microphone was starting
      return;
    }
    try {
      const mimeType = pickMimeType(env.isTypeSupported);
      const recorder = env.createRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: AUDIO_BITS_PER_SECOND });
      recorder.ondataavailable = (event) => {
        if (event.data?.size) current.chunks.push(event.data);
      };
      recorder.start();
      current.recorder = recorder;
      current.mimeType = recorder.mimeType || mimeType;
    } catch (error) {
      fail(current, error);
      return;
    }
    current.startedAt = env.now();
    meter(current, stream);
    view.elapsed?.(0);
    current.clock = env.setInterval(() => {
      sample(current);
      view.elapsed?.(env.now() - current.startedAt);
    }, CLOCK_MS);
    current.limit = env.setTimeout(() => {
      if (session === current) dispatch({ type: 'limit' });
    }, MAX_RECORDING_MS);
  }

  function meter(current, stream) {
    const { ctx } = current;
    if (!ctx) return;
    try {
      current.analyser = ctx.createAnalyser();
      current.analyser.fftSize = 512;
      current.buffer = new Uint8Array(current.analyser.fftSize);
      current.source = ctx.createMediaStreamSource(stream);
      current.source.connect(current.analyser);
    } catch {
      current.analyser = null;
      return;
    }
    const frame = () => {
      if (session !== current) return;
      view.level?.(sample(current));
      current.frame = env.requestAnimationFrame(frame);
    };
    frame();
  }

  // Also sampled by the clock: animation frames pause in a background tab, timers only slow down.
  function sample(current) {
    if (!current.analyser) return 0;
    current.analyser.getByteTimeDomainData(current.buffer);
    const level = levelFromSamples(current.buffer);
    if (current.ctx?.state === 'running') {
      current.samples += 1;
      current.peak = Math.max(current.peak, level);
    }
    return level;
  }

  function stopTimers(current) {
    env.clearTimeout(current.limit);
    env.clearInterval(current.clock);
    env.cancelAnimationFrame(current.frame);
  }

  /** Turns the microphone off and frees the audio graph. Safe to call more than once. */
  function release(current) {
    stopTimers(current);
    current.stream?.getTracks().forEach((track) => track.stop());
    quietly(() => current.source?.disconnect());
    quietly(() => current.ctx?.close?.());
    current.ctx = null;
    current.source = null;
    current.analyser = null;
  }

  function fail(current, error) {
    const isCurrent = session === current;
    release(current);
    if (isCurrent) {
      session = null;
      dispatch({ type: 'fail' });
    }
    toast(voiceErrorMessage(error, 'mic'));
  }

  function stopRecorder(current) {
    const { recorder } = current;
    return new Promise((resolve) => {
      let timer = null;
      const done = () => {
        env.clearTimeout(timer);
        resolve(new Blob(current.chunks, { type: current.mimeType || recorder.mimeType || '' }));
      };
      timer = env.setTimeout(done, STOP_TIMEOUT_MS); // a recorder that never reports 'stop' must not hang the composer
      if (recorder.state === 'inactive') {
        done();
        return;
      }
      recorder.onstop = done;
      try {
        recorder.stop();
      } catch {
        done();
      }
    });
  }

  async function finish(sendIt) {
    const current = session;
    session = null;
    if (!current) return;
    stopTimers(current);
    const ended = () => dispatch({ type: 'done' });
    if (!current.recorder) {
      // Nothing recorded yet: the microphone was still starting.
      release(current);
      if (sendIt) {
        ended();
        toast(VOICE_MESSAGES.TOO_SHORT);
      }
      return;
    }
    if (!sendIt) {
      current.recorder.ondataavailable = null;
      quietly(() => current.recorder.stop());
      current.chunks = [];
      release(current);
      return;
    }
    const durationMs = env.now() - current.startedAt;
    const peak = current.samples >= MIN_LEVEL_SAMPLES ? current.peak : null;
    const blob = await stopRecorder(current);
    current.chunks = [];
    release(current);
    if (disposed) return;
    const problem = recordingProblem({ durationMs, bytes: blob.size, peak });
    if (problem) {
      ended();
      toast(VOICE_MESSAGES[problem]);
      return;
    }
    let text = '';
    try {
      text = String((await transcribe(blob, blob.type)) ?? '').trim();
    } catch (error) {
      if (disposed) return;
      ended();
      toast(voiceErrorMessage(error));
      return;
    }
    if (disposed) return;
    ended();
    if (text) deliver(text);
    else toast(VOICE_MESSAGES.NO_SPEECH);
  }

  return {
    dispatch,
    getState: () => state,
    dispose() {
      const current = session;
      session = null;
      if (current) {
        if (current.recorder) current.recorder.ondataavailable = null;
        quietly(() => current.recorder?.stop());
        current.chunks = [];
        release(current);
      }
      disposed = true;
      state = IDLE;
    },
  };
}

/** The real browser behind createPushToTalk. */
export function browserEnv(win = globalThis) {
  return {
    supported: () => Boolean(win.navigator?.mediaDevices?.getUserMedia && win.MediaRecorder),
    getUserMedia: (constraints) => win.navigator.mediaDevices.getUserMedia(constraints),
    isTypeSupported: (type) => Boolean(win.MediaRecorder?.isTypeSupported?.(type)),
    createRecorder: (stream, options) => new win.MediaRecorder(stream, options),
    createAudioContext: () => {
      const AudioContextClass = win.AudioContext ?? win.webkitAudioContext;
      return AudioContextClass ? new AudioContextClass() : null;
    },
    now: () => win.performance.now(),
    setTimeout: (callback, ms) => win.setTimeout(callback, ms),
    clearTimeout: (id) => win.clearTimeout(id),
    setInterval: (callback, ms) => win.setInterval(callback, ms),
    clearInterval: (id) => win.clearInterval(id),
    requestAnimationFrame: (callback) => win.requestAnimationFrame(callback),
    cancelAnimationFrame: (id) => win.cancelAnimationFrame(id),
    reducedMotion: () => Boolean(win.matchMedia?.('(prefers-reduced-motion: reduce)').matches),
  };
}

const BAR_COUNT = 7;

// The meter and hint sit over the text field while recording; the field keeps its text and focus.
function createVoiceView(button, composer, input, env) {
  const doc = button.ownerDocument;
  const make = (tag, className) => Object.assign(doc.createElement(tag), { className });
  const bars = Array.from({ length: BAR_COUNT }, () => doc.createElement('i'));
  const meterBox = make('span', 'voice-ui__bars');
  meterBox.setAttribute('aria-hidden', 'true');
  meterBox.append(...bars);
  const hint = make('span', 'voice-ui__hint');
  hint.setAttribute('role', 'status');
  const clock = make('span', 'voice-ui__clock');
  clock.setAttribute('aria-hidden', 'true');
  clock.dir = 'ltr';
  const ui = make('div', 'voice-ui');
  ui.dataset.testid = 'chat-voice';
  ui.hidden = true;
  ui.append(meterBox, hint, clock);
  input.after(ui);
  composer.classList.add('has-voice');
  button.setAttribute('aria-pressed', 'false');

  const place = () => {
    Object.assign(ui.style, {
      left: `${input.offsetLeft}px`,
      top: `${input.offsetTop}px`,
      width: `${input.offsetWidth}px`,
      height: `${input.offsetHeight}px`,
    });
  };
  const resetMeter = () => {
    composer.style.removeProperty('--voice-level');
    bars.forEach((bar) => bar.style.removeProperty('height'));
  };

  return {
    render(state) {
      const recording = isRecording(state);
      const busy = state.phase === 'busy';
      if (ui.hidden && (recording || busy)) place();
      ui.hidden = !(recording || busy);
      composer.classList.toggle('is-voice-recording', recording);
      composer.classList.toggle('is-voice-cancel', recording && state.armed === true);
      composer.classList.toggle('is-voice-busy', busy);
      button.setAttribute('aria-pressed', String(recording));
      button.setAttribute('aria-busy', String(busy));
      hint.textContent = hintFor(state);
      if (!recording) {
        resetMeter();
        clock.textContent = '';
        clock.classList.remove('is-ending');
      }
    },
    level(value) {
      composer.style.setProperty('--voice-level', value.toFixed(2));
      const still = env.reducedMotion();
      const t = env.now() / 120;
      bars.forEach((bar, i) => {
        const shape = still ? 1 : 0.55 + 0.45 * Math.sin(i * 1.3 + t) ** 2;
        bar.style.height = `${(4 + value * 18 * shape).toFixed(1)}px`;
      });
    },
    elapsed(ms) {
      clock.textContent = formatClock(ms);
      clock.classList.toggle('is-ending', ms >= MAX_RECORDING_MS - 5000);
    },
    dispose() {
      ui.remove();
      resetMeter();
      composer.classList.remove('has-voice', 'is-voice-recording', 'is-voice-cancel', 'is-voice-busy');
      button.removeAttribute('aria-pressed');
      button.removeAttribute('aria-busy');
    },
  };
}

/**
 * Wires push-to-talk to the chat's mic button. `transcribe(blob, mimeType)` resolves to the text;
 * `send(text)` is the composer's send (it returns { ok, reason }); `input` is the composer's text
 * field; `toast(message)` shows a short status. Returns { dispose }.
 */
export function bindPushToTalk(button, { transcribe, send, input, toast, env = browserEnv() }) {
  const doc = button.ownerDocument;
  const win = doc.defaultView;
  const composer = button.closest('form') ?? button.parentElement;
  const view = createVoiceView(button, composer, input, env);
  const controller = createPushToTalk({ env, transcribe, toast, view, deliver: (text) => deliverTranscript(text, { send, input, toast }) });
  const { dispatch } = controller;
  const at = (event) => ({ x: event.clientX, y: event.clientY, at: env.now() });

  const listeners = [
    [button, 'pointerdown', (event) => {
      if (event.button !== 0 || !event.isPrimary) return;
      event.preventDefault(); // no text selection, and the text field keeps its focus
      try {
        button.setPointerCapture(event.pointerId); // a drag away still reports here
      } catch {
        // the pointer is already gone
      }
      dispatch({ type: 'press', ...at(event) });
    }],
    [button, 'pointermove', (event) => dispatch({ type: 'move', ...at(event) })],
    [button, 'pointerup', (event) => dispatch({ type: 'release', ...at(event) })],
    [button, 'pointercancel', () => dispatch({ type: 'lost' })],
    [button, 'lostpointercapture', () => dispatch({ type: 'lost' })],
    [button, 'contextmenu', (event) => event.preventDefault()], // a long press is a hold, not a menu
    [button, 'keydown', (event) => {
      if (event.key !== ' ' && event.key !== 'Enter') return;
      event.preventDefault();
      if (!event.repeat) dispatch({ type: 'key' });
    }],
    [doc, 'keydown', (event) => {
      if (event.key !== 'Escape' || !isRecording(controller.getState())) return;
      event.preventDefault();
      dispatch({ type: 'escape' });
    }],
    [doc, 'visibilitychange', () => {
      if (doc.visibilityState === 'hidden') dispatch({ type: 'hidden' });
    }],
    [win, 'blur', () => dispatch({ type: 'lost' })],
    [win, 'pagehide', () => dispatch({ type: 'hidden' })],
  ];
  listeners.forEach(([target, type, handler]) => target?.addEventListener(type, handler));

  return {
    dispose() {
      listeners.forEach(([target, type, handler]) => target?.removeEventListener(type, handler));
      controller.dispose();
      view.dispose();
    },
  };
}
