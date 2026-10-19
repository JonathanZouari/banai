import { describe, expect, it } from 'vitest';
import { askBobText, createAlertTracker, mergeQueue, newAlerts } from '../../../src/advice/alertQueue.js';

const item = (id, level = 'warn', fix = null) => ({ id, level, title: `t-${id}`, body: 'b', ...(fix ? { fix } : {}) });
const ready = (items) => ({ status: 'ready', stale: false, items });

describe('warning pop-ups', () => {
  it('only a new warning or critical advisory pops up, most severe first', () => {
    const items = [item('a', 'info'), item('b', 'warn'), item('c', 'critical'), item('d', 'warn')];
    expect(newAlerts(new Set(['d']), items).map((i) => i.id)).toEqual(['c', 'b']);
  });

  it('the first answer is the starting point; a later change raises only what it introduced', () => {
    const tracker = createAlertTracker();
    expect(tracker.next({ status: 'loading', stale: true, items: [] })).toBeNull();
    expect(tracker.next(ready([item('old')]))).toEqual([]); // the design as opened
    expect(tracker.next({ ...ready([item('old'), item('new')]), stale: true })).toBeNull(); // still on its way
    expect(tracker.next(ready([item('old'), item('new')])).map((i) => i.id)).toEqual(['new']);
    expect(tracker.next(ready([item('old'), item('new')]))).toEqual([]); // nothing changed
    expect(tracker.next(ready([item('old')]))).toEqual([]); // fixed
    expect(tracker.next(ready([item('old'), item('new')])).map((i) => i.id)).toEqual(['new']); // and back again
    tracker.reset();
    expect(tracker.next(ready([item('x')]))).toEqual([]); // a new project starts fresh
  });

  it('the queue drops what no longer applies, refreshes fixes, and puts the latest change first', () => {
    const queue = [item('a', 'warn', { label: 'old', ops: [1] }), item('b')];
    const items = [item('a', 'warn', { label: 'new', ops: [2] }), item('c'), item('d', 'critical')];
    const merged = mergeQueue(queue, items, [item('c')]);
    expect(merged.map((i) => i.id)).toEqual(['c', 'a']); // the new one first; b no longer applies
    expect(merged[1].fix.label).toBe('new');
    expect(mergeQueue(merged, items, [item('d', 'critical')]).map((i) => i.id)).toEqual(['d', 'c', 'a']);
  });

  it('asks Bob in words, quoting the warning', () => {
    expect(askBobText({ title: 'אין מקום לפתוח את הדלת' })).toContain('"אין מקום לפתוח את הדלת"');
  });
});
