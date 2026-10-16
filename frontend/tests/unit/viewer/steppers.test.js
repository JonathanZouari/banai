import { describe, expect, it } from 'vitest';
import { LIMITS } from '../../../src/domain/defaults.js';
import {
  HOLD_DELAY_MS, REPEAT_MIN_MS, REPEAT_START_MS, SHIFT_STEP_MM, STEP_MM, canStep, repeatDelay, stepDelta,
} from '../../../src/viewer/steppers.js';

describe('stepDelta', () => {
  it('steps 10 mm, or 100 mm with Shift', () => {
    expect(stepDelta(false)).toBe(10);
    expect(stepDelta(true)).toBe(100);
    expect(stepDelta(undefined)).toBe(STEP_MM);
    expect(SHIFT_STEP_MM).toBe(100);
  });
});

describe('canStep', () => {
  it('allows steps that stay inside the inclusive limits', () => {
    expect(canStep(2000, 10, LIMITS.width)).toBe(true);
    expect(canStep(2000, -10, LIMITS.width)).toBe(true);
    expect(canStep(5990, 10, LIMITS.width)).toBe(true); // lands exactly on the maximum
    expect(canStep(310, -10, LIMITS.width)).toBe(true); // lands exactly on the minimum
  });

  it('refuses steps that would leave the limits', () => {
    expect(canStep(6000, 10, LIMITS.width)).toBe(false);
    expect(canStep(5995, 10, LIMITS.width)).toBe(false);
    expect(canStep(300, -10, LIMITS.width)).toBe(false);
    expect(canStep(200, -10, LIMITS.depth)).toBe(false);
    expect(canStep(1200, 10, LIMITS.depth)).toBe(false);
    expect(canStep(3500, 10, LIMITS.height)).toBe(false);
    expect(canStep(2000, 100, [0, 2050])).toBe(false);
  });

  it('is false for bad input', () => {
    expect(canStep(Number.NaN, 10, LIMITS.width)).toBe(false);
    expect(canStep(undefined, 10, LIMITS.width)).toBe(false);
    expect(canStep(2000, Number.NaN, LIMITS.width)).toBe(false);
    expect(canStep(2000, 10, undefined)).toBe(false);
    expect(canStep(2000, 10, [])).toBe(false);
  });
});

describe('repeatDelay', () => {
  it('waits 400 ms before the first repeat, then 120 ms', () => {
    expect(HOLD_DELAY_MS).toBe(400);
    expect(repeatDelay(0)).toBe(400);
    expect(repeatDelay(1)).toBe(REPEAT_START_MS);
    expect(repeatDelay(1)).toBe(120);
  });

  it('accelerates down to a 50 ms floor and never goes below it', () => {
    const delays = Array.from({ length: 40 }, (_, count) => repeatDelay(count));
    for (let i = 2; i < delays.length; i += 1) expect(delays[i]).toBeLessThanOrEqual(delays[i - 1]);
    expect(delays[2]).toBeLessThan(delays[1]);
    expect(delays.at(-1)).toBe(REPEAT_MIN_MS);
    expect(REPEAT_MIN_MS).toBe(50);
    expect(Math.min(...delays)).toBe(50);
    expect(repeatDelay(10_000)).toBe(50);
  });

  it('treats a negative or non-numeric count as the first repeat', () => {
    expect(repeatDelay(-3)).toBe(400);
    expect(repeatDelay(Number.NaN)).toBe(400);
    expect(repeatDelay(undefined)).toBe(400);
    expect(repeatDelay(1.9)).toBe(120);
  });

  it('gives several repeats within one second of holding', () => {
    let elapsed = 0;
    let repeats = 0;
    for (;;) {
      elapsed += repeatDelay(repeats);
      if (elapsed > 1000) break;
      repeats += 1;
    }
    expect(repeats).toBeGreaterThanOrEqual(5);
    expect(repeats).toBeLessThanOrEqual(8);
  });
});
