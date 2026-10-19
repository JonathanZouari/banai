import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test, expect, openChat, openDesigner } from './fixtures.js';

// bobHabanai Day 4: a design-aware chat turn returns a signed proposal (ADR-020/025). Only /api/chat is
// mocked (no OpenAI). The proposal itself is signed by the backend's own code with the E2E server's
// secret, so the real /api/proposals/apply checks the signature, the revision and the design hash.
const STORAGE_KEY = 'banai.openaiApiKey';
const KEY = 'sk-test-e2eKey0123456789abcdefWXYZ';
const PROPOSAL_SECRET = 'e2e-proposal-secret'; // playwright.config.js gives the API the same one
const BACKEND = fileURLToPath(new URL('../../../backend', import.meta.url));

const envelope = (data) => ({
  status: 200,
  contentType: 'application/json',
  headers: { 'Access-Control-Allow-Origin': '*' },
  body: JSON.stringify({ success: true, data, error: null }),
});

// Reads {design, revision, ops, summary, alterWidth?} on stdin and prints the signed proposal. With
// alterWidth the proposal is made for a different design than the one the browser holds.
const SIGN = `
import json, sys
from app.agent.proposals import sign
from app.domain.schema import parse_design
request = json.loads(sys.stdin.buffer.read().decode("utf-8"))
design = parse_design(request["design"])
if request.get("alterWidth"):
    design = {**design, "dimensions": {**design["dimensions"], "width": request["alterWidth"]}}
print(json.dumps(sign(request["ops"], request["summary"], request["revision"], design)))
`;

function signProposal(request) {
  const out = execFileSync('uv', ['run', '--quiet', 'python', '-c', SIGN], {
    cwd: BACKEND,
    input: JSON.stringify(request),
    env: { ...process.env, PROPOSAL_SECRET },
    encoding: 'utf-8',
  });
  return JSON.parse(out);
}

/**
 * Answers /api/chat with the next scripted turn: { reply, ops?, summary?, alterWidth?, tamper? }. A turn
 * with ops carries a proposal signed for the design and revision the browser sent. Returns the requests.
 */
async function scriptChat(page, turns) {
  const requests = [];
  await page.route('**/api/chat', async (route) => {
    const body = route.request().postDataJSON();
    requests.push(body);
    const turn = turns[requests.length - 1];
    const data = { reply: turn.reply, model: 'gpt-test-mini' };
    if (turn.ops) {
      const proposal = signProposal({ design: body.design, revision: body.revision, ops: turn.ops, summary: turn.summary, alterWidth: turn.alterWidth });
      if (turn.tamper) proposal.ops = turn.tamper;
      data.proposal = proposal;
    }
    await route.fulfill(envelope(data));
  });
  return requests;
}

async function connect(page) {
  await page.route('**/api/settings/ai/verify', (route) => route.fulfill(envelope({ status: 'connected', model: 'gpt-test-mini', maskedKey: 'sk-...WXYZ', checkedAt: '2026-10-17T09:30:00+00:00' })));
  await page.addInitScript(([name, key]) => localStorage.setItem(name, key), [STORAGE_KEY, KEY]);
  await openDesigner(page);
  await openChat(page);
  await expect(page.getByTestId('chat-status')).toHaveText('המפתח מחובר');
}

async function say(page, text) {
  await page.getByTestId('chat-input').fill(text);
  await page.getByTestId('chat-send').click();
}

const state = (page) => page.evaluate(() => {
  const { design, revision } = window.__banai.store.getState();
  return { width: design.dimensions.width, height: design.dimensions.height, revision };
});
const systemBubbles = (page) => page.getByTestId('chat-bubble-system');
const WIDER = [{ op: 'update_dimensions', width: 2400 }];

test.describe('chat proposals (signed by the server, confirmed by the customer)', () => {
  test('a proposal shows its changes and impact; Confirm applies it through the server as one undo step; a manual edit makes the next one stale', async ({ page }) => {
    const requests = await scriptChat(page, [
      { reply: 'הרחבה ל-240 ס"מ נותנת לכל תא כ-8 ס"מ נוספים. הנה ההצעה.', ops: WIDER, summary: 'רוחב הארון 240 ס"מ' },
      { reply: 'אפשר להנמיך ל-230 ס"מ.', ops: [{ op: 'update_dimensions', height: 2300 }], summary: 'גובה 230 ס"מ' },
    ]);
    await connect(page);
    const before = await state(page);

    await say(page, 'אפשר ארון רחב יותר, 240?');
    const card = page.getByTestId('proposal-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText('רוחב הארון 240 ס"מ');
    await expect(card.locator('.proposal__row')).toContainText(['רוחב']);
    await expect(card.locator('.proposal__row').first()).toContainText('200 ס״מ ← 240 ס״מ');
    // The impact line comes from the real advisories on the design before and after.
    await expect(page.getByTestId('proposal-impact')).toHaveText(/אזהר/);
    // The agent saw the committed design and its revision.
    expect(requests[0].revision).toBe(before.revision);
    expect(requests[0].design.dimensions.width).toBe(2000);
    // Nothing changes before Confirm.
    expect(await state(page)).toEqual(before);

    await page.getByTestId('proposal-confirm').click();
    await expect(systemBubbles(page).last()).toContainText('אושר והוחל');
    await expect(card).toHaveCount(0);
    await expect.poll(async () => (await state(page)).width).toBe(2400);
    expect((await state(page)).revision).toBe(before.revision + 1);

    // A second proposal, then a manual undo: the proposal was made for a design that no longer exists.
    await say(page, 'ואפשר גם נמוך יותר?');
    await expect(card).toContainText('גובה 230 ס"מ');
    await expect(page.getByTestId('proposal-confirm')).toBeEnabled();
    await page.locator('body').click({ position: { x: 5, y: 5 } }); // out of the text field, so Ctrl+Z is the app's
    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await state(page)).width).toBe(2000); // the adopted proposal was one step
    await expect(card).toHaveClass(/proposal--stale/);
    await expect(page.getByTestId('proposal-confirm')).toBeDisabled();
    await expect(card).toContainText('התכנון השתנה מאז ההצעה');

    // Cancel drops it and leaves the design alone.
    const undone = await state(page);
    await page.getByTestId('proposal-cancel').click();
    await expect(card).toHaveCount(0);
    await expect(systemBubbles(page).last()).toContainText('ההצעה בוטלה');
    expect(await state(page)).toEqual(undone);
  });

  test('the server refuses a proposal made for another design (409 STALE) and one changed in the browser', async ({ page, allowConsoleErrors }) => {
    // Two agent turns and two refused applies: over 30 s when the whole suite loads the machine.
    test.slow();
    // The browser logs the refused requests as resource errors; those two are expected here.
    allowConsoleErrors(/status of (409|400)/);
    await scriptChat(page, [
      // Signed for a 210 cm wardrobe while the browser holds 200 cm: same revision, different design.
      { reply: 'הנה הצעה.', ops: WIDER, summary: 'רוחב 240 ס"מ', alterWidth: 2100 },
      // Signed correctly, then its ops are edited before Confirm.
      { reply: 'הנה עוד הצעה.', ops: WIDER, summary: 'רוחב 240 ס"מ', tamper: [{ op: 'update_dimensions', width: 4000 }] },
    ]);
    await connect(page);
    const before = await state(page);
    const applies = [];
    page.on('response', (response) => {
      if (response.url().endsWith('/api/proposals/apply')) applies.push(response.status());
    });

    await say(page, 'רוחב 240');
    await expect(page.getByTestId('proposal-confirm')).toBeEnabled(); // the client cannot tell
    await page.getByTestId('proposal-confirm').click();
    await expect(systemBubbles(page).last()).toContainText('התכנון השתנה מאז ההצעה, ולכן היא לא הוחלה');
    expect(await state(page)).toEqual(before);

    await say(page, 'בכל זאת 240');
    await page.getByTestId('proposal-confirm').click();
    await expect(systemBubbles(page).last()).toContainText('לא הצלחנו להחיל את ההצעה. התכנון לא השתנה.');
    expect(await state(page)).toEqual(before);
    // Response events reach the test asynchronously, possibly after the bubble: wait for both (flaked under load).
    await expect.poll(() => applies).toEqual([409, 400]);
  });
});
