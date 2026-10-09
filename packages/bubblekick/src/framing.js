// Perspective distance needed for both goals and both touchlines, with HUD clearance.
export function fieldCameraDistance(aspect, fov = 40) {
  const tan = Math.tan((fov * Math.PI) / 360);
  const width = Math.max(0.2, aspect);
  return Math.max(
    (34 / (tan * width * 0.88) + 22 * 0.716) / 1.117,
    ((22 * 0.698) / (tan * 0.76) + 22 * 0.716) / 1.117,
  );
}
