// Freeze transforms of static scenery: no per-frame local matrix recomposition (world matrices are only recomputed if
// something marks them dirty). Call once after building the world, on objects that never move (not cars/flags/wind
// meshes that animate via position/rotation).
export function freezeStatic(root) {
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (o === root) return;
    o.matrixAutoUpdate = false;
    o.updateMatrix();
    o.matrixWorldNeedsUpdate = true;
  });
  root.updateMatrixWorld(true);
  return root;
}
