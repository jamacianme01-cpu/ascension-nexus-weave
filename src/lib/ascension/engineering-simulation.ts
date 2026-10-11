/** A deliberately scoped, inspectable 1-D physical calculation.
 * Input values are user-supplied or explicitly labeled examples.
 * NOT a multiphysics solver, certification, or validation of a device.
 */
export interface MotionInputs {
  massKg: number;
  forceN: number;
  dragNsPerM: number;
  durationS: number;
}
export interface MotionResult {
  displacementM: number;
  velocityMPerS: number;
  accelerationMPerS2: number;
  workJ: number;
  input: MotionInputs;
}
export function simulateMotion(input: MotionInputs): MotionResult {
  const { massKg, forceN, dragNsPerM, durationS } = input;
  if (![massKg, forceN, dragNsPerM, durationS].every(Number.isFinite))
    throw new Error("Enter finite numerical values.");
  if (massKg <= 0 || durationS < 0 || dragNsPerM < 0 || forceN < 0)
    throw new Error("Mass must be positive; force, drag and time cannot be negative.");
  if (massKg > 1e12 || forceN > 1e12 || dragNsPerM > 1e12 || durationS > 1e6)
    throw new Error("Inputs exceed the supported calculation range.");
  // m dv/dt = F - c v, with x(0)=v(0)=0.
  // Closed-form solution avoids accumulated integration error.
  const rate = dragNsPerM / massKg;
  const alpha = rate * durationS;
  const oneMinusDecay = -Math.expm1(-alpha);
  const velocityMPerS = dragNsPerM === 0
    ? forceN / massKg * durationS
    : forceN / dragNsPerM * oneMinusDecay;
  const displacementM = dragNsPerM === 0
    ? forceN / (2 * massKg) * durationS ** 2
    : forceN / dragNsPerM * (durationS - oneMinusDecay / rate);
  const accelerationMPerS2 = (forceN - dragNsPerM * velocityMPerS) / massKg;
  return { displacementM, velocityMPerS, accelerationMPerS2,
    workJ: forceN * displacementM, input };
}
