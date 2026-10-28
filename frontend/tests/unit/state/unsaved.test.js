import { describe, expect, it, vi } from 'vitest';
import { buildPreset } from '../../../src/domain/presets.js';
import { createStore } from '../../../src/state/store.js';
import { createUnsavedTracker } from '../../../src/state/unsaved.js';
import { loadCatalog } from '../domain/helpers.js';

const catalog = loadCatalog();
const setup = () => {
  const store = createStore({ design: buildPreset('basic', catalog), catalog });
  return { store, tracker: createUnsavedTracker(store) };
};
const height = (store, value) => store.dispatch([{ op: 'update_dimensions', height: value }]);

describe('unsaved changes', () => {
  it('starts clean and becomes dirty after an edit', () => {
    const { store, tracker } = setup();
    expect(tracker.isDirty()).toBe(false);
    height(store, 2300);
    expect(tracker.isDirty()).toBe(true);
  });

  it('is clean again when the edit is undone by value', () => {
    const { store, tracker } = setup();
    height(store, 2300);
    height(store, 2400);
    expect(tracker.isDirty()).toBe(false);
  });

  it('ignores selection and view changes', () => {
    const { store, tracker } = setup();
    store.select('shf_l1');
    store.setDoorsVisible(false);
    expect(tracker.isDirty()).toBe(false);
  });

  it('a save clears it, but an edit made during the save stays unsaved', () => {
    const { store, tracker } = setup();
    height(store, 2300);
    const saving = store.getState().design;
    tracker.markSaved(saving);
    expect(tracker.isDirty()).toBe(false);
    height(store, 2200);
    tracker.markSaved(saving); // a save that started before the last edit
    expect(tracker.isDirty()).toBe(true);
  });

  it('reset makes the current design the baseline and notifies only on change', () => {
    const { store, tracker } = setup();
    const listener = vi.fn();
    tracker.subscribe(listener);
    store.replaceDesign(buildPreset('kids', catalog), 2);
    expect(listener).toHaveBeenLastCalledWith(true);
    tracker.reset();
    expect(tracker.isDirty()).toBe(false);
    expect(listener).toHaveBeenLastCalledWith(false);
    tracker.reset();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
