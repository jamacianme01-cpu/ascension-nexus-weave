import assert from "node:assert/strict";
import { createServer } from "vite";
import { resolve } from "node:path";
const server = await createServer({
  configFile:false, server:{middlewareMode:true},
  resolve:{alias:{"@":resolve("src")}},
});
try {
  const {simulateMotion} = await server.ssrLoadModule("/src/lib/ascension/engineering-simulation.ts");
  const ideal = simulateMotion({massKg:2,forceN:10,dragNsPerM:0,durationS:3});
  assert.equal(ideal.accelerationMPerS2,5);
  assert.equal(ideal.velocityMPerS,15);
  assert.equal(ideal.displacementM,22.5);
  assert.equal(ideal.workJ,225);
  console.log("PASS closed-form undamped motion");
  const damped = simulateMotion({massKg:1,forceN:6,dragNsPerM:2,durationS:1});
  assert.ok(Math.abs(damped.velocityMPerS - 3*(1-Math.exp(-2))) < 1e-10);
  assert.ok(Math.abs(damped.displacementM - 3*(1-(1-Math.exp(-2))/2)) < 1e-10);
  console.log("PASS closed-form linear damping");
  const zero = simulateMotion({massKg:1,forceN:0,dragNsPerM:1,durationS:9});
  assert.equal(zero.velocityMPerS,0);
  assert.equal(zero.displacementM,0);
  console.log("PASS zero applied force");
  assert.throws(()=>simulateMotion({massKg:0,forceN:1,dragNsPerM:0,durationS:1}),/Mass must be positive/);
  assert.throws(()=>simulateMotion({massKg:1,forceN:-1,dragNsPerM:0,durationS:1}),/cannot be negative/);
  assert.throws(()=>simulateMotion({massKg:1,forceN:NaN,dragNsPerM:0,durationS:1}),/finite/);
  console.log("PASS invalid and missing numerical inputs fail closed");
} finally { await server.close(); }
