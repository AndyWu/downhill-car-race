// Vehicle roster: 10 salvaged soap-box derby trucks (see ARCHITECTURE.md contract).
import { MODELS_A } from './models_a.js';
import { MODELS_B } from './models_b.js';
import { assemble } from './build.js';

const DEFS = [...MODELS_A, ...MODELS_B];
const BY_ID = new Map(DEFS.map((d) => [d.id, d]));

export const TRUCKS = DEFS.map((d) => ({
  id: d.id,
  name: d.name,
  description: d.description,
  mass: d.stats.mass,
  dragCoef: d.stats.dragCoef,
  frontalArea: d.stats.frontalArea,
  rollingResist: d.stats.rollingResist,
  gripMul: d.stats.gripMul,
  steerLock: d.stats.steerLock,
  steerRate: d.stats.steerRate,
  paddleEfficiency: d.stats.paddleEfficiency,
  brakeForce: d.stats.brakeForce,
  suspension: { ...d.stats.suspension },
  flagColor: d.flagColor,
  number: d.number,
  wheelRadius: d.layout.R,
  wheelRadiusFront: d.layout.Rf,
  wheelBase: d.layout.WB,
  trackWidth: d.layout.T,
  driverEyeHeight: d.layout.eyeY + d.layout.R,
}));

/** spec: an entry of TRUCKS (or its id / index). Returns { group, parts } — forward is -Z, origin at axle height. */
export function buildTruck(spec, { materials, lod } = {}) {
  const key = typeof spec === 'number' ? DEFS[spec]?.id : typeof spec === 'string' ? spec : spec?.id;
  const def = BY_ID.get(key);
  if (!def) throw new Error(`buildTruck: unknown truck ${key}`);
  return assemble(def, materials, lod);
}
