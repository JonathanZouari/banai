// The domain uses integer millimetres; the scene uses metres (Y up).
export const MM_TO_M = 0.001;
export const toM = (mm) => mm * MM_TO_M;

// ASSUMPTION: visual-only prototype values. They are NOT part of the design model and
// are not manufacturing specifications; they only make the render readable.
export const VISUAL = Object.freeze({
  backThickness: 6,
  doorThickness: 18,
  doorGap: 2,
  drawerGap: 3,
  railRadius: 12,
  slidingTrackGap: 4,
  slidingOverlap: 60,
  slidingRailHeight: 20,
  handleWidth: 14,
  handleDepth: 12,
  handleLength: 400,
  handleHeightFromFloor: 1050,
  handleInset: 40,
  doorOpenAngle: 95, // degrees a hinged door swings out when "Doors open" is on
  doorOpenMs: 400, // duration of the open/close animation
});
