// OPT-IN live voice run against the REAL OpenAI key. Not part of CI or `npm test`.
//
//   LIVE_VOICE=1 node tests/live/voice.live.mjs
//
// Needs: tests/live/make-voice-fixtures.sh run once (free, local), the frontend on :5173 and the
// backend on :8000 started with VOICE_ENABLED=true. Budget guard: at most MAX_REQUESTS OpenAI-backed
// requests and MAX_USD estimated spend; the run aborts before exceeding either. Prints estimates only
// (the endpoints do not return token usage): check the OpenAI usage page for the real figure.
import { chromium } from '@playwright/test';
import { existsSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.env.LIVE_VOICE !== '1') {
  console.log('Skipped: set LIVE_VOICE=1 to run the live voice scenarios (they use real OpenAI credits).');
  process.exit(0);
}

const WEB = process.env.LIVE_WEB ?? 'http://localhost:5173';
const AUDIO = join(dirname(fileURLToPath(import.meta.url)), 'audio');
const MAX_REQUESTS = 30;
const MAX_USD = 0.25;
const STT_PER_MIN = 0.006; // conservative: the default model is half this
const TTS_PER_MIN = 0.015;
const CHAT_PER_CALL = 0.0025;

let requests = 0;
let spend = 0;
const log = [];

function charge(kind, detail = 0) {
  const cost = kind === 'stt' ? (Math.min(detail / 32000, 20) / 60) * STT_PER_MIN : kind === 'tts' ? (detail / 14 / 60) * TTS_PER_MIN : CHAT_PER_CALL;
  if (requests + 1 > MAX_REQUESTS || spend + cost > MAX_USD) throw new Error(`Budget guard: stopping before request ${requests + 1} (spent about $${spend.toFixed(4)})`);
  requests += 1;
  spend += cost;
}

const digits = (text) => text.replace(/[^\d.]/g, ' ').split(/\s+/).filter(Boolean);
const has = (text, ...words) => words.some((word) => text.toLowerCase().includes(word));

const SCENARIOS = [
  { id: 'L1', file: 'en_width', lang: 'en', note: 'EN width in words', check: (t) => digits(t).includes('240') || has(t, 'two hundred forty', 'two hundred and forty', '240') },
  { id: 'L2', file: 'en_inches', lang: 'en', note: 'EN inches', check: (t) => has(t, '80 inch', 'eighty inch', '80"') },
  { id: 'L3', file: 'en_meters', lang: 'en', note: 'EN meters and a half', check: (t) => has(t, '2.4', 'two point four') && has(t, 'half', '0.5', '.5') },
  { id: 'L4', file: 'en_multi', lang: 'en', note: 'EN multi-part', check: (t) => has(t, 'drawer') && has(t, 'walnut') },
  { id: 'L5', file: 'he_width', lang: 'he', note: 'HE width (240 cm)', check: (t) => digits(t).includes('240') || has(t, 'מאתיים וארבעים', 'מאתיים ארבעים') },
  { id: 'L6', file: 'he_shelf', lang: 'he', note: 'HE add shelf at 100 cm', check: (t) => has(t, 'מדף') },
  { id: 'L7', file: 'silence', lang: '-', note: 'silence is "no speech", never an invented sentence', expectEmpty: true },
  { id: 'L8', file: 'en_long', lang: 'en', note: 'long speech is capped at 20 s without a crash', check: (t) => t.length > 20, long: true },
];

async function launch(file) {
  const path = join(AUDIO, `${file}.wav`);
  if (!existsSync(path)) throw new Error(`Missing ${path}. Run tests/live/make-voice-fixtures.sh first.`);
  const browser = await chromium.launch({
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-audio-capture=${path}`],
  });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  page.on('pageerror', (error) => log.push(`PAGE ERROR ${error.message}`));
  return { browser, page, bytes: statSync(path).size };
}

async function openApp(page) {
  await page.goto(WEB);
  await page.getByTestId('entry-basic').click();
  await page.waitForFunction(() => window.__banai?.viewer.meshOf('shf_l1'));
  await page.getByTestId('voice-mic').waitFor({ timeout: 8000 });
}

const results = [];

async function runScenario(scenario) {
  const { browser, page, bytes } = await launch(scenario.file);
  const started = Date.now();
  try {
    await openApp(page);
    const seconds = scenario.file === 'silence' ? 3 : Math.min(bytes / 32000, 20);
    // The recording length follows the audio file (it loops), up to the 20 s cap.
    charge('stt', Math.min(bytes, 640000));
    const transcribed = page.waitForResponse((r) => r.url().includes('/api/voice/transcribe'), { timeout: 60000 });
    await page.getByTestId('voice-mic').click();
    await page.waitForTimeout(scenario.long ? 21500 : Math.max(1500, Math.min(seconds, 12) * 1000 + 700));
    if (!scenario.long) await page.getByTestId('voice-mic').click(); // long: the 20 s auto-stop ends it
    const response = await transcribed.catch(() => null);
    const body = response ? await response.json().catch(() => null) : null;
    const text = body?.data?.text ?? '';
    const composer = await page.getByTestId('chat-input').inputValue();
    const status = await page.getByTestId('voice-status').innerText().catch(() => '');
    const pass = scenario.expectEmpty
      ? (body?.data?.noSpeech === true || !response) && composer === ''
      : Boolean(response?.ok()) && scenario.check(text) && composer === text;
    results.push({ ...scenario, pass, text, status, ms: Date.now() - started, http: response?.status() ?? 'none' });
  } catch (error) {
    results.push({ ...scenario, pass: false, text: '', status: String(error.message).slice(0, 120), ms: Date.now() - started, http: 'error' });
    if (String(error.message).startsWith('Budget guard')) throw error;
  } finally {
    await browser.close();
  }
}

// L9: a full spoken turn, with a real agent proposal and a spoken reply. Nothing may be applied.
async function runFullTurn() {
  const scenario = { id: 'L9', file: 'en_width', lang: 'en', note: 'full spoken turn: voice -> composer -> Send -> proposal -> spoken reply, nothing applied' };
  const { browser, page } = await launch('en_width');
  const started = Date.now();
  let speakSeen = false;
  let applySeen = false;
  try {
    await openApp(page);
    page.on('request', (r) => { if (r.url().includes('/api/proposals/apply')) applySeen = true; });
    page.on('response', (r) => { if (r.url().includes('/api/voice/speak') && r.ok()) speakSeen = true; });
    const revisionBefore = await page.evaluate(() => window.__banai.store.getState().revision);
    charge('stt', 120000);
    await page.getByTestId('voice-mic').click();
    await page.waitForTimeout(4200);
    await page.getByTestId('voice-mic').click();
    await page.waitForFunction(() => document.querySelector('[data-testid=chat-input]').value.length > 0, null, { timeout: 60000 });
    const heard = await page.getByTestId('chat-input').inputValue();
    charge('chat');
    await page.getByTestId('chat-send').click();
    await page.getByTestId('proposal-card').waitFor({ timeout: 60000 });
    charge('tts', 90);
    await page.waitForTimeout(6000);
    const revisionAfter = await page.evaluate(() => window.__banai.store.getState().revision);
    const pass = speakSeen && !applySeen && revisionAfter === revisionBefore;
    results.push({ ...scenario, pass, text: heard, status: `spoken reply: ${speakSeen}, apply requested: ${applySeen}, revision ${revisionBefore} -> ${revisionAfter}`, ms: Date.now() - started, http: 200 });
  } catch (error) {
    results.push({ ...scenario, pass: false, text: '', status: String(error.message).slice(0, 140), ms: Date.now() - started, http: 'error' });
  } finally {
    await browser.close();
  }
}

try {
  for (const scenario of SCENARIOS) await runScenario(scenario);
  await runFullTurn();
} catch (error) {
  console.error(String(error.message));
}

const passed = results.filter((r) => r.pass).length;
console.log('\nLIVE VOICE RESULTS');
for (const r of results) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.id} [${r.lang}] ${r.note} | ${r.ms} ms | http ${r.http}\n     heard: ${JSON.stringify(r.text).slice(0, 160)}${r.status ? `\n     note: ${r.status}` : ''}`);
}
console.log(`\n${passed}/${results.length} passed. OpenAI-backed requests: ${requests} of ${MAX_REQUESTS}. Estimated spend: about $${spend.toFixed(4)} (cap $${MAX_USD}).`);
if (log.length) console.log(`Page errors:\n${log.join('\n')}`);
writeFileSync(join(dirname(fileURLToPath(import.meta.url)), 'last-run.json'), JSON.stringify({ results, requests, spend }, null, 2));
process.exit(passed === results.length ? 0 : 1);
