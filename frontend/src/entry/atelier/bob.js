// Bob (בוב הבנאי), our own drawing (not the TV character): a fictional master carpenter in his fifties
// (greying hair, a short beard, thin glasses) with a pencil behind his ear, in flat geometric shapes. States:
// idle (breathes, blinks), thinking (looks up, dots), speaking (the mouth and the warm glow follow a level),
// happy (closed eyes, a small nod). Decorative: aria-hidden; whoever uses it says the state in text.

let instances = 0;

/**
 * The drawing as SVG markup. `uid` makes the gradient and clip ids unique per instance (two Bobs on one
 * page must not share ids); it is generated here, never taken from data.
 */
export function bobArt(uid) {
  if (typeof uid !== 'string' || !/^bob-[0-9]+$/.test(uid)) throw new Error('bobArt: invalid uid');
  return `
<svg viewBox="0 0 200 200" class="bob__svg" aria-hidden="true" focusable="false">
  <defs>
    <radialGradient id="${uid}-glow" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#f5b86a" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#f5b86a" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="${uid}-badge"><circle cx="100" cy="100" r="96"/></clipPath>
  </defs>
  <circle class="bob__glow" cx="100" cy="104" r="96" fill="url(#${uid}-glow)"/>
  <g clip-path="url(#${uid}-badge)">
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
      <path d="M56 84 C56 52 80 40 102 42 C128 44 146 58 145 84 C138 70 124 62 108 64 C96 58 78 62 70 74 C64 78 60 80 56 84 Z" fill="#6f6862"/>
      <path d="M60 78 C62 60 76 50 92 48 C80 54 70 62 66 74 Z" fill="#a8a29c" opacity="0.8"/>
      <path d="M140 78 C138 64 130 56 120 52 C128 58 134 66 136 76 Z" fill="#a8a29c" opacity="0.7"/>
      <path d="M96 46 C104 38 118 38 124 46 C116 44 106 46 100 52 Z" fill="#8a837c"/>
      <g class="bob__brows">
        <path d="M75 80 Q84 74 93 78" stroke="#5e5852" stroke-width="4" fill="none" stroke-linecap="round"/>
        <path d="M107 78 Q116 74 125 80" stroke="#5e5852" stroke-width="4" fill="none" stroke-linecap="round"/>
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
      <circle cx="74" cy="108" r="7" fill="#e0a08f" opacity="0.12"/>
      <circle cx="126" cy="108" r="7" fill="#e0a08f" opacity="0.12"/>
      <path d="M98 100 Q100 106 104 104" stroke="#d9a07c" stroke-width="2.4" fill="none" stroke-linecap="round"/>
      <path d="M58 106 C59 132 78 144 100 144 C122 144 141 132 142 106 C137 118 128 123 116 123 C110 127 90 127 84 123 C72 123 63 118 58 106 Z" fill="#7d766f"/>
      <path d="M58 106 C61 121 70 127 82 129 C70 125 63 119 58 106 Z" fill="#a8a29c" opacity="0.5"/>
      <path d="M84 111 Q92 106 100 109 Q108 106 116 111 Q110 115 100 113 Q90 115 84 111 Z" fill="#6f6862"/>
      <g class="bob__glasses" fill="none" stroke="#2f2a26" stroke-width="2.2">
        <circle cx="84" cy="94" r="11"/>
        <circle cx="116" cy="94" r="11"/>
        <path d="M95 93 Q100 90 105 93"/>
        <path d="M73 92 L60 88"/>
        <path d="M127 92 L140 88"/>
      </g>
      <path class="bob__smile" d="M88 116 Q100 122 112 116" stroke="#7a3e30" stroke-width="3.4" fill="none" stroke-linecap="round"/>
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
}

/**
 * Mounts Bob in `host`. Returns { setState(state), setLevel(0..1), state, dispose() }. dispose() stops his
 * animation loop and the blink timer; call it when the host leaves the page.
 */
export function createBob(host, { size = 160, reducedMotion = false } = {}) {
  instances += 1;
  host.classList.add('bob');
  host.style.setProperty('--bob-size', `${size}px`);
  host.innerHTML = bobArt(`bob-${instances}`); // a static constant drawn by us; nothing from data goes in
  const root = host.querySelector('svg');
  const mouth = root.querySelector('.bob__mouth');
  const glow = root.querySelector('.bob__glow');
  const eyes = root.querySelector('.bob__eyes-open');
  let state = 'idle';
  let level = 0;
  let shown = 0;
  let blinkTimer = 0;
  let raf = 0;
  let alive = true;
  host.dataset.state = state;

  const blink = () => {
    if (!alive) return;
    if (!reducedMotion && state !== 'happy') {
      eyes.animate([{ transform: 'scaleY(1)' }, { transform: 'scaleY(0.08)' }, { transform: 'scaleY(1)' }],
        { duration: 160, easing: 'ease-in-out' });
    }
    blinkTimer = setTimeout(blink, 2600 + Math.random() * 3200);
  };
  blinkTimer = setTimeout(blink, 1800);

  // The mouth follows the level through a short spring, so it never jitters frame to frame. The loop
  // only runs while he speaks or the mouth is still closing.
  const tick = () => {
    raf = 0;
    if (!alive) return;
    shown += ((state === 'speaking' ? level : 0) - shown) * 0.35;
    mouth.setAttribute('ry', (2 + shown * 9).toFixed(2));
    mouth.setAttribute('rx', (8 + shown * 3).toFixed(2));
    glow.style.transform = `scale(${(0.86 + shown * 0.24).toFixed(3)})`;
    glow.style.opacity = state === 'speaking' ? String(0.55 + shown * 0.45) : '';
    if (state === 'speaking' || shown > 0.002) raf = requestAnimationFrame(tick);
  };
  const wake = () => {
    if (!raf && alive) raf = requestAnimationFrame(tick);
  };

  return {
    setState(next) {
      state = next;
      host.dataset.state = next;
      wake();
      if (next === 'happy' && !reducedMotion) {
        host.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-6%)' }, { transform: 'translateY(0)' }],
          { duration: 520, easing: 'cubic-bezier(0.34, 1.4, 0.64, 1)' });
      }
    },
    setLevel(value) {
      level = Math.max(0, Math.min(1, Number(value) || 0));
      wake();
    },
    get state() {
      return state;
    },
    dispose() {
      alive = false;
      clearTimeout(blinkTimer);
      if (raf) cancelAnimationFrame(raf);
    },
  };
}

/**
 * A believable speaking envelope (syllables of 120-220 ms with short pauses) for Bob's greeting, which is
 * text, not audio. Returns a function that stops it.
 */
export function fakeVoice(onLevel, { seconds = 4, random = Math.random } = {}) {
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
      const pause = random() < 0.18;
      target = pause ? 0.04 : 0.35 + random() * 0.65;
      syllableEnd = now + (pause ? 220 : 120 + random() * 100);
    }
    current += (target - current) * 0.3;
    onLevel(current);
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => {
    cancelAnimationFrame(raf);
    onLevel(0);
  };
}
