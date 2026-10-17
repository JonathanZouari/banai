import { describe, expect, it } from 'vitest';
import { VIDEO, VIDEO_MARGIN, motionAtVideo, orbitAt, poseAt, videoFrames } from '../../../src/render/videoPlan.js';
import { centerOf, fitDistance } from '../../../src/viewer/camera.js';

const DIMS = { width: 2000, height: 2400, depth: 600 };

describe('video plan', () => {
  it('has one frame per 1/fps with exact timestamps', () => {
    const frames = videoFrames();
    expect(frames).toHaveLength(VIDEO.seconds * VIDEO.fps);
    expect(frames[1].timestamp).toBeCloseTo(1 / 30, 12);
    expect(frames.at(-1).u).toBe(1);
    expect(frames.every((f) => f.duration === 1 / 30)).toBe(true);
    expect(videoFrames({ seconds: 1, fps: 10 })).toHaveLength(10);
  });

  it('starts and ends closed, opens, holds fully open, then closes', () => {
    expect(motionAtVideo(0)).toBe(0);
    expect(motionAtVideo(0.6)).toBe(1);
    expect(motionAtVideo(1)).toBe(0);
    const opening = [0.12, 0.2, 0.3, 0.4, 0.49].map(motionAtVideo);
    expect(opening).toEqual([...opening].sort((a, b) => a - b));
    const closing = [0.76, 0.8, 0.85, 0.9, 0.94].map(motionAtVideo);
    expect(closing).toEqual([...closing].sort((a, b) => b - a));
  });

  it('orbits from the right of the front to the left, symmetrically', () => {
    const start = orbitAt(0);
    const middle = orbitAt(0.5);
    const end = orbitAt(1);
    expect(start.azimuth).toBeCloseTo(-end.azimuth, 12);
    expect(start.azimuth).toBeGreaterThan(0);
    expect(middle.azimuth).toBeCloseTo(0, 12);
    expect(middle.elevation).toBeGreaterThan(start.elevation);
  });

  it('keeps the camera at the fit distance, looking at the centre', () => {
    const fov = 40;
    const aspect = 16 / 9;
    const pose = poseAt(DIMS, 0.3, { fov, aspect });
    expect(pose.target).toEqual(centerOf(DIMS));
    const distance = Math.hypot(...pose.position.map((v, i) => v - pose.target[i]));
    expect(distance).toBeCloseTo(fitDistance(DIMS, fov, aspect, VIDEO_MARGIN), 9);
    expect(pose.position[2]).toBeGreaterThan(pose.target[2]); // in front of the wardrobe
  });
});
