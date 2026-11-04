import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
async function module(path) {
  const code = ts.transpileModule(readFileSync(new URL("../" + path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
}
const { compileDesignIdentity, clipTokenEstimate } = await module("src/lib/ascension/design-image-brief.ts");
const { assessRaster } = await module("src/lib/ascension/image-identity-check.ts");

const electromagnetic = compileDesignIdentity(
  "Design a linear propulsion engine",
  "Electromagnetic rail propulsion engine",
  ["Stator rail", "Moving carriage", "Inverter"],
  "A single linear electromagnetic accelerator with one stator rail and one carriage, unlike a shop compressor.",
);
assert.equal(electromagnetic.count, 1);
assert.equal(electromagnetic.architecture, "electromagnetic linear propulsion");
assert.match(electromagnetic.prompt, /^One single long horizontal electromagnetic track with one sliding carriage/);
assert.doesNotMatch(electromagnetic.prompt, /pneumatic|compressor|inverter|turbine/i);
assert.match(electromagnetic.prompt, /sliding carriage/);
assert.match(electromagnetic.negative, /pneumatic compressor/);
assert.match(electromagnetic.negative, /turbine/);
assert.match(electromagnetic.negative, /motorcycle/);

const pneumatic = compileDesignIdentity(
  "Design a linear propulsion engine",
  "Pneumatic linear propulsion engine",
  ["Air cylinder", "Carriage", "Valve block"],
  "Compressed air drives one carriage along one rail.",
);
assert.equal(pneumatic.architecture, "pneumatic linear propulsion");
assert.match(pneumatic.prompt, /^One single long horizontal pneumatic cylinder driving one carriage/);
assert.doesNotMatch(pneumatic.prompt, /electromagnetic|hydraulic|valve/i);
assert.match(pneumatic.negative, /electric motor catalog/);

const electrohydraulic = compileDesignIdentity(
  "Design a linear propulsion engine",
  "Electrohydraulic linear drive",
  ["Hydraulic ram", "Pump", "Rail"],
  "One hydraulic ram on a rail with an integrated electric pump.",
);
assert.equal(electrohydraulic.architecture, "electrohydraulic linear propulsion");
assert.match(electrohydraulic.prompt, /^One single long horizontal hydraulic ram driving one carriage/);
assert.doesNotMatch(electrohydraulic.prompt, /pneumatic|pump/i);
assert.match(electrohydraulic.prompt, /hydraulic ram/);

const blend = compileDesignIdentity(
  "Design a linear propulsion engine",
  "Blended linear propulsion engine",
  ["Rail stator", "Pneumatic cylinder", "Hydraulic ram"],
  "Combines electromagnetic, pneumatic and electrohydraulic drives as multiple machine views.",
);
assert.equal(blend.count, 1);
assert.equal(blend.architecture, "integrated linear propulsion");
assert.match(blend.prompt, /^One single long horizontal linear track with one sliding carriage/);
assert.doesNotMatch(blend.prompt, /electromagnetic|pneumatic|hydraulic|multiple machine|views/i);
for (const identity of [electromagnetic, pneumatic, electrohydraulic, blend]) {
  assert.ok(clipTokenEstimate(identity.prompt) <= 72, identity.prompt);
  assert.equal(identity.count, 1);
}

function canvas(paint) {
  const width = 96;
  const height = 96;
  const gray = new Uint8Array(width * height).fill(176);
  paint(gray, width, height);
  return gray;
}
function disc(gray, width, cx, cy, radius, value) {
  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      if (x < 1 || y < 1 || x >= width - 1 || y >= 95) continue;
      if ((x - cx) ** 2 + (y - cy) ** 2 <= radius * radius) gray[y * width + x] = value;
    }
  }
}
const one = assessRaster(canvas((gray, width) => disc(gray, width, 48, 48, 18, 30)), 96, 96, { count: 1 });
assert.equal(one.ok, true, one.reason);
assert.equal(one.objects, 1);
const separated = assessRaster(canvas((gray, width) => {
  disc(gray, width, 18, 48, 12, 24);
  disc(gray, width, 78, 48, 12, 24);
}), 96, 96, { count: 1 });
assert.equal(separated.ok, false, "two products must be refused");
assert.match(separated.reason, /separate objects|split layout/);
const group = assessRaster(canvas((gray, width) => {
  disc(gray, width, 20, 48, 10, 24);
  disc(gray, width, 48, 48, 10, 24);
  disc(gray, width, 76, 48, 10, 24);
}), 96, 96, { count: 3 });
assert.equal(group.ok, true, group.reason + " objects=" + group.objects);
assert.ok(group.objects <= 4, "a separated group must not become a crowd");
const collage = assessRaster(canvas((gray, width) => {
  for (let y = 8; y < 88; y++) for (let x = 6; x < 34; x++) gray[y * width + x] = 20;
  for (let y = 8; y < 88; y++) for (let x = 62; x < 90; x++) gray[y * width + x] = 20;
}), 96, 96, { count: 1 });
assert.equal(collage.ok, false);
assert.equal(collage.collage, true);
const quad = canvas((gray, width) => {
  disc(gray, width, 48, 48, 8, 25);
  for (let step = 0; step < 26; step++) {
    gray[(48 - step) * width + (48 - step)] = 25;
    gray[(48 - step) * width + (48 + step)] = 25;
    gray[(48 + step) * width + (48 - step)] = 25;
    gray[(48 + step) * width + (48 + step)] = 25;
  }
  disc(gray, width, 22, 22, 5, 25);
  disc(gray, width, 74, 22, 5, 25);
  disc(gray, width, 22, 74, 5, 25);
  disc(gray, width, 74, 74, 5, 25);
});
const aircraft = assessRaster(quad, 96, 96, { count: 1 });
assert.equal(aircraft.ok, true, aircraft.reason + " objects=" + aircraft.objects);
const blank = assessRaster(new Uint8Array(96 * 96).fill(176), 96, 96, { count: 1 });
assert.equal(blank.ok, false);
const scene = canvas((gray, width) => {
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) gray[y * width + x] = 240;
  for (let y = 0; y < 12; y++) for (let x = 84; x < 96; x++) gray[y * width + x] = 30;
});
assert.equal(assessRaster(scene, 96, 96, { count: 1 }).ok, false);
const gradient = canvas((gray, width) => {
  for (let y = 0; y < 96; y++) for (let x = 0; x < width; x++) gray[y * width + x] = 120 + Math.floor(y / 2);
  disc(gray, width, 48, 48, 18, 30);
});
assert.equal(assessRaster(gradient, 96, 96, { count: 1 }).ok, true, "a vertical studio gradient is not a split scene");
console.log("PASS design identity: architecture lock, summary exclusion, and structural picture refusal");
