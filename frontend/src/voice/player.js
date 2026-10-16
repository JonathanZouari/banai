// Plays spoken replies. The server streams raw 16-bit mono PCM at 24 kHz. A reply is several short
// pieces fetched in parallel and played in order with the Web Audio API, back to back.
//
// Each piece waits for a small start buffer (about a third of its length, at least 0.6 s) before it
// plays: OpenAI generates speech only 1 to 2.5 times faster than real time, so starting at the very
// first bytes runs dry and stutters. Later pieces have long been downloaded when they are needed.
// One reply plays at a time: a new reply, a new recording or turning voice off stops the current one.
export const PCM_SAMPLE_RATE = 24000;
const BYTES_PER_SECOND = PCM_SAMPLE_RATE * 2;
const LEAD_IN_SECONDS = 0.12; // headphones and speakers often clip the first moments after waking
const MIN_START_BUFFER_SECONDS = 0.6;
const START_BUFFER_SHARE = 0.35;
const BLOCK_SECONDS = 0.25; // network chunks are merged into blocks of about this length

export function createPlayer({ AudioContextImpl = globalThis.AudioContext ?? globalThis.webkitAudioContext } = {}) {
  let context = null;
  let generation = 0;
  const sources = new Set();
  let finish = null;
  let abortCurrent = null; // lets stop() break a read that is still waiting for network data

  const ensureContext = () => {
    if (!context) context = new AudioContextImpl();
    return context;
  };

  const stop = () => {
    generation += 1;
    sources.forEach((source) => {
      source.onended = null;
      try { source.stop(); } catch { /* already finished */ }
    });
    sources.clear();
    const done = finish;
    finish = null;
    done?.();
    abortCurrent?.();
    abortCurrent = null;
  };

  return {
    isPlaying: () => sources.size > 0,
    stop,

    /** Create and resume the audio context. Call it from a click, so browsers allow sound later. */
    prime() {
      try {
        const audio = ensureContext();
        if (audio.state === 'suspended') audio.resume?.().catch(() => {});
      } catch { /* no Web Audio: playing will report it */ }
    },

    /**
     * Plays pieces in order. `items` are { response, expectedSeconds }, where `response` is a promise of a
     * fetch Response (or the Response itself). Resolves when everything has played or playback was stopped.
     */
    async play(items) {
      stop();
      const mine = generation;
      const list = Array.isArray(items) ? items : [{ response: items, expectedSeconds: 0 }];
      let audio;
      try {
        audio = ensureContext();
        if (audio.state === 'suspended') await audio.resume();
      } catch (error) {
        throw new Error('Playback failed', { cause: error });
      }
      const aborted = new Promise((resolve) => { abortCurrent = () => resolve({ aborted: true }); });
      let nextTime = audio.currentTime + LEAD_IN_SECONDS;
      let last = null;

      const scheduleBytes = (chunks) => {
        const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const usable = length - (length % 2); // whole 16-bit samples only
        if (usable === 0) return chunks;
        const merged = new Uint8Array(length);
        let offset = 0;
        chunks.forEach((chunk) => { merged.set(chunk, offset); offset += chunk.length; });
        const view = new DataView(merged.buffer, 0, usable);
        const samples = new Float32Array(usable / 2);
        for (let i = 0; i < samples.length; i += 1) samples[i] = view.getInt16(i * 2, true) / 32768;
        const buffer = audio.createBuffer(1, samples.length, PCM_SAMPLE_RATE);
        buffer.copyToChannel(samples, 0);
        const source = audio.createBufferSource();
        source.buffer = buffer;
        source.connect(audio.destination);
        nextTime = Math.max(nextTime, audio.currentTime + 0.02); // after a stall, play at once instead of in the past
        source.start(nextTime);
        nextTime += buffer.duration;
        sources.add(source);
        last = source;
        return usable < length ? [merged.slice(usable)] : [];
      };

      const playPiece = async (response, expectedSeconds) => {
        const startAt = Math.max(MIN_START_BUFFER_SECONDS, expectedSeconds * START_BUFFER_SHARE) * BYTES_PER_SECOND;
        const reader = response.body?.getReader?.();
        if (!reader) {
          scheduleBytes([new Uint8Array(await response.arrayBuffer())]);
          return true;
        }
        let pending = [];
        let pendingBytes = 0;
        let started = false;
        for (;;) {
          const result = await Promise.race([reader.read(), aborted]);
          if (result.aborted || mine !== generation) { reader.cancel?.()?.catch?.(() => {}); return false; }
          if (result.value?.length) {
            pending.push(result.value);
            pendingBytes += result.value.length;
          }
          const ready = result.done || (started ? pendingBytes >= BLOCK_SECONDS * BYTES_PER_SECOND : pendingBytes >= startAt);
          if (ready && pendingBytes > 0) {
            pending = scheduleBytes(pending);
            pendingBytes = pending.reduce((sum, chunk) => sum + chunk.length, 0);
            started = true;
          }
          if (result.done) return true;
        }
      };

      // All the requests are already in flight (the caller started them together); play them in order.
      for (const item of list) {
        const response = await Promise.race([Promise.resolve(item.response), aborted.then(() => null)]);
        if (!response || mine !== generation) {
          list.forEach((other) => Promise.resolve(other.response).then((r) => r?.body?.cancel?.()).catch(() => {}));
          return;
        }
        if (!(await playPiece(response, item.expectedSeconds ?? 0))) return;
      }
      abortCurrent = null;
      if (mine !== generation || !last) return;
      await new Promise((resolve) => {
        finish = resolve;
        last.onended = () => { sources.clear(); finish = null; resolve(); };
      });
    },
  };
}
