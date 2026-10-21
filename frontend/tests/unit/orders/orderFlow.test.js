import { describe, expect, it } from 'vitest';
import { createStore, ORDER_LOCKED } from '../../../src/state/store.js';
import { summaryLines } from '../../../src/orders/orderFlow.js';
import { catalog, design } from '../pdf/fixtures.js';

describe('order lock', () => {
  const make = () => createStore({ design, revision: 1, catalog });

  it('blocks edits after confirmation and restores them on unlock', () => {
    const store = make();
    const ops = [{ op: 'update_dimensions', width: 2100 }];
    store.confirmOrder();
    expect(store.getState().order.confirmed).toBe(true);
    const blocked = store.dispatch(ops);
    expect(blocked.ok).toBe(false);
    expect(blocked.error.code).toBe(ORDER_LOCKED);
    expect(() => store.replaceDesign(design, 5)).toThrow();
    expect(store.getState().revision).toBe(1);
    store.unlockOrder();
    expect(store.dispatch(ops).ok).toBe(true);
    expect(store.getState().revision).toBe(2);
  });

  it('summarises size, compartments and material without price or payment text', () => {
    const text = summaryLines(design, catalog).join(' | ');
    expect(text).toMatch(/2000 x 2400 x 600/);
    expect(text).toMatch(/3 compartment/);
    expect(text.toLowerCase()).not.toMatch(/price|payment|\$/);
  });
});
