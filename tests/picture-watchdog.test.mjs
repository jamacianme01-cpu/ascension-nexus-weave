import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

async function module(path) {
  const code = ts.transpileModule(readFileSync(new URL("../" + path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
}

const { judgePictureWatch, isReportablePictureWatch } = await module("src/lib/ascension/picture-watchdog.ts");
const { namedVehicle, cargoDesignBrief, describedEnclosure } = await module("src/lib/ascension/vehicle-cargo.ts");

const quiet = judgePictureWatch({ generator: "Grok", elapsedMs: 18400, pictureProduced: false, stalled: true });
assert.equal(quiet.generator, "Grok");
assert.equal(quiet.picture_produced, false);
assert.equal(quiet.exceeded_budget, true);
assert.equal(quiet.stalled, true);
assert.equal(quiet.fallback, "free image generator");
assert.match(quiet.message, /Grok went quiet after 18\.4 seconds/);
assert.match(quiet.message, /No picture was produced/);
assert.match(quiet.message, /Fallback: free image generator/);
assert.equal(isReportablePictureWatch(quiet), true);

const slow = judgePictureWatch({ generator: "Free image", elapsedMs: 61200, pictureProduced: true });
assert.equal(slow.exceeded_budget, true);
assert.match(slow.message, /Free image was slow: 61\.2 seconds/);
assert.match(slow.message, /past its 45 second budget/);
assert.match(slow.message, /A picture was produced/);

const fast = judgePictureWatch({ generator: "Grok", elapsedMs: 4000, pictureProduced: true });
assert.equal(isReportablePictureWatch(fast), false);

const hunyuan = judgePictureWatch({ generator: "Hunyuan3D", elapsedMs: 21000, pictureProduced: false, stalled: true });
assert.match(hunyuan.message, /Hunyuan3D/);
assert.match(hunyuan.message, /No picture was produced/);
assert.match(hunyuan.message, /named-part assembly/);

const objective = "one 15-inch ZVX subwoofer, 2 ohm, 3000 watt Big Boss Terramp amplifier, two 6-inch ports 18 inches long firing upward, for a 2016 Jeep Renegade";
assert.deepEqual(namedVehicle(objective), { year: 2016, make: "Jeep", model: "Renegade" });
const enclosure = describedEnclosure(objective);
assert.equal(enclosure.driver_inches, 15);
assert.equal(enclosure.port_count, 2);
assert.equal(enclosure.port_length_inches, 18);
assert.equal(enclosure.port_direction, "upward");
const brief = cargoDesignBrief({
  vehicle: "2016 Jeep Renegade",
  year: 2016,
  lookup: "failed",
  error: "Spec page returned HTTP 404.",
  source_url: null,
  measures: [],
  seat_fold: null,
  pass_through: "No pass-through published.",
  subwoofer_fitment: "No subwoofer fitment published.",
  enclosure,
  constraints: ["Vehicle cargo specs could not be fetched. No dimensions were invented."],
});
assert.match(brief, /2016 Jeep Renegade/);
assert.match(brief, /Lookup failed/);
assert.match(brief, /No dimensions were invented/);

console.log("PASS picture watchdog and cargo brief");
