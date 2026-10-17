import { createHero } from './hero.js';
import { cornerMarks, measure } from './measure.js';
import { createBob, fakeVoice } from './bob.js';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (selector) => document.querySelector(selector);

// 1. The hero: the wardrobe assembles; then Bob says hello.
const hero = createHero($('.hero__canvas'), $('.hero__dims'), { reducedMotion });
// Words, not "± 0 mm": a sign and digits inside Hebrew text reorder themselves.
measure($('.hero__measured'), { label: 'עד המילימטר', delay: reducedMotion ? 0 : 900 });

const miniBob = createBob($('#bob-mini'), { size: 58 });
const LINE = 'היי, אני בוב. ספרו לי מה צריך להיכנס לארון, ואני אשרטט.';
let greetTimer = 0;
let stopVoice = () => {};
function greet() {
  clearTimeout(greetTimer);
  stopVoice();
  const line = $('.bob-line');
  const text = $('#bob-line-text');
  line.classList.remove('is-on');
  text.textContent = '';
  greetTimer = setTimeout(() => {
    line.classList.add('is-on');
    if (reducedMotion) {
      text.textContent = LINE;
      miniBob.setState('happy');
      return;
    }
    // The words appear at speaking pace while the mouth moves.
    miniBob.setState('speaking');
    stopVoice = fakeVoice((level) => miniBob.setLevel(level), { seconds: 3.4 });
    const words = LINE.split(' ');
    words.forEach((word, i) => setTimeout(() => { text.textContent = words.slice(0, i + 1).join(' '); }, i * 300));
    setTimeout(() => miniBob.setState('happy'), 3500);
    setTimeout(() => miniBob.setState('idle'), 4600);
  }, reducedMotion ? 0 : (hero.assembledAt + 1.2) * 1000);
}
greet();
$('#replay').addEventListener('click', () => {
  hero.replay();
  greet();
});

// Language buttons (visual only in the prototype).
document.querySelectorAll('.hero__bar .segmented button').forEach((button, _, all) => button.addEventListener('click', () => {
  all.forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
}));

// 2. The signature.
measure($('#sig-measured'), { count: 240, unit: ' ס״מ', delay: 200 });
const bar = $('#demo-width');
const widthMeasure = measure(bar, { count: 200, unit: ' ס״מ' });
let wide = false;
$('#demo-width-btn').addEventListener('click', () => {
  wide = !wide;
  bar.style.width = wide ? '88%' : '70%';
  widthMeasure.setText(wide ? '240 ס״מ' : '200 ס״מ');
});
const marks = cornerMarks($('#demo-proposal'));
$('#demo-confirm').addEventListener('click', () => {
  marks.confirm();
  $('#demo-proposal .demo__impact').textContent = 'אושר והוחל. אפשר לבטל עם Ctrl+Z.';
});
$('#demo-reset').addEventListener('click', () => {
  marks.reset();
  $('#demo-proposal .demo__impact').textContent = 'בלי שינוי באזהרות';
});
measure($('#demo-column'), { side: 'side', count: 64, unit: ' ס״מ', gap: 10 });

// 3. Bob's states.
const bigBob = createBob($('#bob-big'), { size: 220 });
const headBob = createBob($('#bob-head'), { size: 44 });
const STATUS = {
  idle: 'בוב רגוע ומקשיב.',
  thinking: 'בוב חושב על ההצעה.',
  speaking: 'בוב מדבר. הפה וההילה עוקבים אחרי עוצמת הקול.',
  happy: 'בוב שמח: ההצעה אושרה.',
};
let stopBig = () => {};
document.querySelectorAll('.bob-stage .segmented button').forEach((button, _, all) => button.addEventListener('click', () => {
  const state = button.dataset.state;
  all.forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
  stopBig();
  bigBob.setState(state);
  headBob.setState(state);
  $('#bob-status').textContent = STATUS[state];
  $('#bob-pill').hidden = state !== 'speaking';
  if (state === 'speaking') {
    stopBig = fakeVoice((level) => { bigBob.setLevel(level); headBob.setLevel(level); }, { seconds: 30 });
  }
}));

// Test hook for screenshots with a hidden pane (rAF paused there).
window.__atelier = { hero, bigBob, miniBob };
