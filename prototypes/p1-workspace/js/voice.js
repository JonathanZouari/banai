// Push-to-talk. Hold the mic to speak, release to send, drag away to cancel; a short tap
// toggles hands-free recording. The prototype transcribes with the browser's speech
// recognition (he-IL); production records audio and transcribes on the backend, behind
// the same callbacks. Voice is only an input method: AI changes still need a tap to confirm.
const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
const CANCEL_DISTANCE = 70; // px
const TAP_MS = 220;

export class PushToTalk {
  constructor(button, handlers) {
    this.btn = button;
    this.h = handlers;
    this.active = false;
    this.toggleMode = false;
    this.cancelArmed = false;
    button.addEventListener('pointerdown', (e) => this.#down(e));
    button.addEventListener('pointermove', (e) => this.#move(e));
    button.addEventListener('pointerup', (e) => this.#up(e));
    button.addEventListener('pointercancel', () => this.cancel());
    button.addEventListener('keydown', (e) => {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      e.preventDefault();
      if (this.active) this.stop(); else { this.toggleMode = true; this.start(); }
    });
  }

  get supported() { return Boolean(Recognition) && Boolean(navigator.mediaDevices?.getUserMedia); }

  #down(e) {
    if (e.button !== 0) return;
    if (this.active && this.toggleMode) { this.stop(); return; }
    this.btn.setPointerCapture(e.pointerId);
    this.origin = [e.clientX, e.clientY];
    this.pressedAt = performance.now();
    this.toggleMode = false;
    this.start();
  }

  #move(e) {
    if (!this.active || this.toggleMode || !this.origin) return;
    const armed = Math.hypot(e.clientX - this.origin[0], e.clientY - this.origin[1]) > CANCEL_DISTANCE;
    if (armed !== this.cancelArmed) { this.cancelArmed = armed; this.h.onArmCancel?.(armed); }
  }

  #up() {
    if (!this.active || this.toggleMode) return;
    this.origin = null;
    if (this.cancelArmed) { this.cancel(); return; }
    if (performance.now() - this.pressedAt < TAP_MS) { this.toggleMode = true; this.h.onToggleMode?.(); return; }
    this.stop();
  }

  async start() {
    if (this.active) return;
    this.active = true;
    this.cancelArmed = false;
    this.text = '';
    this.h.onStart?.();
    if (!this.supported) { this.#fail('הדפדפן הזה לא תומך בתמלול בהדגמה. בייצור התמלול נעשה בשרת.'); return; }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.#meter(this.stream);
      const rec = (this.rec = new Recognition());
      rec.lang = 'he-IL';
      rec.interimResults = true;
      rec.continuous = true;
      rec.onresult = (ev) => {
        this.text = [...ev.results].map((r) => r[0].transcript).join(' ').trim();
        this.h.onPartial?.(this.text);
      };
      rec.onerror = (ev) => { if (ev.error !== 'aborted' && ev.error !== 'no-speech') this.#fail(ev.error === 'not-allowed' ? 'אין הרשאה למיקרופון.' : 'התמלול נכשל. נסו שוב.'); };
      rec.onend = () => { if (this.stopping) this.#finish(); };
      rec.start();
    } catch {
      this.#fail('אין גישה למיקרופון.');
    }
  }

  stop() {
    if (!this.active) return;
    this.stopping = true;
    if (this.rec) this.rec.stop(); else this.#finish();
  }

  cancel() {
    if (!this.active) return;
    this.#teardown();
    this.h.onCancel?.();
  }

  /** Test hook: runs the same UI path with a scripted transcript (no microphone needed). */
  async simulate(text, { ms = 1400 } = {}) {
    this.active = true;
    this.h.onStart?.();
    const words = text.split(' ');
    const steps = 14;
    for (let i = 1; i <= steps; i++) {
      await new Promise((r) => setTimeout(r, ms / steps));
      this.h.onLevel?.(0.25 + 0.6 * Math.abs(Math.sin(i * 1.7)));
      this.text = words.slice(0, Math.ceil((i / steps) * words.length)).join(' ');
      this.h.onPartial?.(this.text);
    }
    this.#finish();
  }

  #meter(stream) {
    const ctx = (this.ctx = new AudioContext());
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Uint8Array(analyser.fftSize);
    const tick = () => {
      if (!this.active) return;
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += ((v - 128) / 128) ** 2;
      this.h.onLevel?.(Math.min(1, Math.sqrt(sum / buf.length) * 4));
      this.raf = requestAnimationFrame(tick);
    };
    tick();
  }

  #finish() {
    const text = this.text?.trim() ?? '';
    this.#teardown();
    if (text) this.h.onFinal?.(text); else this.h.onCancel?.('לא נשמע דיבור.');
  }

  #fail(msg) {
    this.#teardown();
    this.h.onError?.(msg);
  }

  #teardown() {
    this.active = false;
    this.stopping = false;
    this.toggleMode = false;
    this.cancelArmed = false;
    cancelAnimationFrame(this.raf);
    try { this.rec?.abort(); } catch { /* already stopped */ }
    this.rec = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.ctx?.close();
    this.ctx = null;
  }
}
