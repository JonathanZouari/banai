// Opening hinged doors is a view effect only: it moves meshes already in the scene and never touches
// the design, the revision or the ops. Each hinged door part (panel, outline, handle) carries
// userData.swing = { pivotX, pivotZ, side, rest } and is rotated about the vertical hinge axis.
import * as THREE from 'three';

export const MAX_OPEN_ANGLE = THREE.MathUtils.degToRad(100);

/** True when the design has doors that swing on hinges (sliding panels and "no doors" do not). */
export const hasHingedDoors = (design) => design.doors.type === 'hinged' && design.doors.items.length > 0;

/** Tag a mesh so applyDoorSwing can rotate it about the hinge at (pivotX, pivotZ), in metres. */
export function markSwing(object, { pivotX, pivotZ, side }) {
  object.userData.swing = { pivotX, pivotZ, side, rest: object.position.clone() };
}

/** Open the doors of `group`: progress 0 = closed, 1 = fully open. Doors swing out towards the viewer. */
export function applyDoorSwing(group, progress) {
  const angle = MAX_OPEN_ANGLE * THREE.MathUtils.clamp(progress, 0, 1);
  group.children.forEach((object) => {
    const swing = object.userData.swing;
    if (!swing) return;
    // A left hinge swings the free edge (+x) towards +z with a negative turn about y; a right hinge the opposite.
    const turn = swing.side === 'right' ? angle : -angle;
    const dx = swing.rest.x - swing.pivotX;
    const dz = swing.rest.z - swing.pivotZ;
    object.position.set(
      swing.pivotX + dx * Math.cos(turn) + dz * Math.sin(turn),
      swing.rest.y,
      swing.pivotZ - dx * Math.sin(turn) + dz * Math.cos(turn),
    );
    object.rotation.y = turn;
  });
}
