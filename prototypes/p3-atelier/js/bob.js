// Bob the Builder, our own drawing (not the TV character): a young carpenter with a pencil behind his
// ear, drawn in flat geometric shapes. States: idle (breathes, blinks), thinking (looks up, dots),
// speaking (the mouth and the warm glow follow the voice level), happy (smiling eyes, a small hop).
// Decorative: aria-hidden, the state is announced in text by whoever uses it.
const NS = 'http://www.w3.org/2000/svg';
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const ART = `
<svg viewBox="0 0 200 200" class="bob__svg" aria-hidden="true">
  <defs>
    <radialGradient id="bob-glow" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#f5b86a" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#f5b86a" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="bob-badge"><circle cx="100" cy="100" r="96"/></clipPath>
  </defs>
  <circle class="bob__glow" cx="100" cy="104" r="96" fill="url(#bob-glow)"/>
  <g clip-path="url(#bob-badge)">
    <circle cx="100" cy="100" r="96" fill="#f4ede3"/>
    <g class="bob__body">
      <!-- shoulders: a deep teal shirt and a leather apron strap -->
      <path d="M28 214 C30 168 62 148 100 148 C138 148 170 168 172 214 Z" fill="#2f4b5c"/>
      <path d="M78 150 L86 214 L96 214 L90 150 Z" fill="#b8844f"/>
      <path d="M122 150 L114 214 L104 214 L110 150 Z" fill="#b8844f"/>
      <path d="M88 148 C92 158 108 158 112 148 Z" fill="#e4b58f"/>
    </g>
    <g class="bob__head">
      <rect x="88" y="128" width="24" height="24" rx="8" fill="#e8b994"/>
      <!-- the pencil behind his right ear (viewer's left): drawn under the ear and the head, so only the
           eraser end shows, up and behind. The outer group places it; the inner one moves when he thinks. -->
      <g transform="rotate(48 50 80)">
        <g class="bob__pencil">
          <rect x="22" y="76" width="7" height="9" rx="2.5" fill="#e98f9c"/>
          <rect x="28" y="76" width="7" height="9" fill="#bfc3c7"/>
          <rect x="34" y="76" width="44" height="9" rx="1" fill="#f2c14e"/>
          <rect x="34" y="76" width="44" height="3" fill="#f7d77e"/>
          <path d="M78 76 L89 80.5 L78 85 Z" fill="#ead9bd"/>
          <path d="M86 79.3 L89 80.5 L86 81.7 Z" fill="#3a3330"/>
        </g>
      </g>
      <circle cx="56" cy="98" r="10" fill="#efc29f"/>
      <circle cx="144" cy="98" r="10" fill="#efc29f"/>
      <circle cx="100" cy="94" r="46" fill="#f3caa8"/>
      <!-- hair -->
      <path d="M56 84 C56 52 80 40 102 42 C128 44 146 58 145 84 C138 70 124 62 108 64 C96 58 78 62 70 74 C64 78 60 80 56 84 Z" fill="#3b2a20"/>
      <path d="M96 46 C104 38 118 38 124 46 C116 44 106 46 100 52 Z" fill="#4a3528"/>
      <g class="bob__brows">
        <path d="M76 80 Q84 75 92 79" stroke="#3b2a20" stroke-width="3.2" fill="none" stroke-linecap="round"/>
        <path d="M108 79 Q116 75 124 80" stroke="#3b2a20" stroke-width="3.2" fill="none" stroke-linecap="round"/>
      </g>
      <g class="bob__eyes">
        <g class="bob__eyes-open">
          <ellipse cx="84" cy="94" rx="5" ry="6.2" fill="#2a211c"/>
          <ellipse cx="116" cy="94" rx="5" ry="6.2" fill="#2a211c"/>
          <circle cx="86" cy="91.5" r="1.6" fill="#fff"/>
          <circle cx="118" cy="91.5" r="1.6" fill="#fff"/>
        </g>
        <g class="bob__eyes-happy">
          <path d="M78 96 Q84 88 90 96" stroke="#2a211c" stroke-width="3.4" fill="none" stroke-linecap="round"/>
          <path d="M110 96 Q116 88 122 96" stroke="#2a211c" stroke-width="3.4" fill="none" stroke-linecap="round"/>
        </g>
      </g>
      <circle cx="74" cy="108" r="7" fill="#ee9e8f" opacity="0.35"/>
      <circle cx="126" cy="108" r="7" fill="#ee9e8f" opacity="0.35"/>
      <path d="M98 100 Q100 106 104 104" stroke="#d9a07c" stroke-width="2.4" fill="none" stroke-linecap="round"/>
      <path class="bob__smile" d="M86 114 Q100 126 114 114" stroke="#7a3e30" stroke-width="3.4" fill="none" stroke-linecap="round"/>
      <g class="bob__talk">
        <ellipse class="bob__mouth" cx="100" cy="117" rx="9" ry="6" fill="#6b2f27"/>
        <ellipse class="bob__tongue" cx="100" cy="121" rx="5" ry="2.4" fill="#e07f78"/>
      </g>
    </g>
  </g>
  <g class="bob__thought">
    <circle cx="160" cy="44" r="5" fill="#b9a99a"/>
    <circle cx="174" cy="44" r="5" fill="#b9a99a"/>
    <circle cx="188" cy="44" r="5" fill="#b9a99a"/>
  </g>
</svg>`;

/** Mounts Bob in `host`. Returns { setState(state), setLevel(0..1) }. */
export function createBob(host, { size = 160 } = {}) {
  host.classList.add('bob');
  host.style.setProperty('--bob-size', `${size}px`);
  host.innerHTML = ART; // a static constant drawn by us; nothing from data goes in here
  const root = host.querySelector('svg');
  const q = (selector) => root.querySelector(selector);
  const mouth = q('.bob__mouth');
  const glow = q('.bob__glow');
  const eyes = q('.bob__eyes-open');
  let state = 'idle';
  let level = 0;
  let shown = 0;
  let blinkTimer = 0;

  const blink = () => {
    clearTimeout(blinkTimer);
    if (!reduced() && state !== 'happy') {
      eyes.animate([{ transform: 'scaleY(1)' }, { transform: 'scaleY(0.08)' }, { transform: 'scaleY(1)' }],
        { duration: 160, easing: 'ease-in-out' });
    }
    blinkTimer = setTimeout(blink, 2600 + Math.random() * 3200);
  };
  blinkTimer = setTimeout(blink, 1800);

  // The mouth follows the level with a short spring, so it never jitters frame to frame.
  const tick = () => {
    shown += ((state === 'speaking' ? level : 0) - shown) * 0.35;
    mouth.setAttribute('ry', (2 + shown * 9).toFixed(2));
    mouth.setAttribute('rx', (8 + shown * 3).toFixed(2));
    glow.style.transform = `scale(${(0.86 + shown * 0.24).toFixed(3)})`;
    glow.style.opacity = state === 'speaking' ? String(0.55 + shown * 0.45) : '';
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  return {
    setState(next) {
      state = next;
      host.dataset.state = next;
      if (next === 'happy' && !reduced()) {
        host.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-6%)' }, { transform: 'translateY(0)' }],
          { duration: 520, easing: 'cubic-bezier(0.34, 1.4, 0.64, 1)' });
      }
    },
    setLevel(value) {
      level = Math.max(0, Math.min(1, value));
    },
    get state() {
      return state;
    },
  };
}

/** A believable speaking envelope for the demo: syllables of 120-220 ms with short pauses. */
export function fakeVoice(onLevel, { seconds = 4 } = {}) {
  const started = performance.now();
  let syllableEnd = started;
  let target = 0;
  let current = 0;
  let raf = 0;
  const step = (now) => {
    if (now - started > seconds * 1000) {
      onLevel(0);
      return;
    }
    if (now > syllableEnd) {
      const pause = Math.random() < 0.18;
      target = pause ? 0.04 : 0.35 + Math.random() * 0.65;
      syllableEnd = now + (pause ? 220 : 120 + Math.random() * 100);
    }
    current += (target - current) * 0.3;
    onLevel(current);
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}

export { NS };
