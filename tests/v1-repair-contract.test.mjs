import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const ui = read("src/components/ascension/independent-engage.tsx");
const route = read("src/routes/api/public/ascension/independent.ts");
const viewer = read("src/components/ascension/RealityViewer.tsx");
const engine = read("src/lib/ascension/engine/zai.server.ts");
const app = read("src/routes/index.tsx");
const checklist = read("docs/ASCENSION_V1_OWNER_APPROVAL_CHECKLIST.md");

const tests = [
  ["approved Tree and Book remain entry scene", () => {
    assert.match(ui, /ascension-tree-behind-book-hq\.jpg/);
    assert.match(ui, /ascension-scene-hero/);
    assert.match(app, /IndependentEngage/);
    assert.doesNotMatch(ui, /ascension-arrival-message/);
  }],
  ["Tree welcomes through voice, not a new written banner", () => {
    assert.match(ui, /const greeting = "Welcome to ASCENSION/);
    assert.match(ui, /window\.addEventListener\("pointerdown", tryWelcome/);
    assert.match(ui, /say\(greeting/);
  }],
  ["initial analysis is concise on screen and full in backend", () => {
    assert.match(ui, /split\(\/\(\?\<\=\[\.\!\?\]\)\\s\+\/\)/);
    assert.match(ui, /slice\(0, 350\)/);
    assert.match(ui, /phase: "pathways", firstAnswer: answer\.slice\(0, 6000\)/);
  }],
  ["three pathways and fourth blend are real selectable responses", () => {
    assert.match(ui, /data\.pathways\.length !== 3/);
    assert.match(ui, /\[\.\.\.result\.pathways, result\.blend\]/);
    assert.match(ui, /setChoice\(index\)/);
  }],
  ["pathway picture is requested on selection, not on all cards", () => {
    assert.match(ui, /function PathwayView/);
    assert.match(ui, /phase: "picture", pathway: path/);
    assert.match(ui, /\{selected &&/);
    assert.match(ui, /<PathwayView/);
  }],
  ["V1 pathway tabs expose only Description Labels Blueprint Dissect", () => {
    assert.match(ui, /onDive\(path, picture, "blueprint"\)/);
    assert.match(ui, /onDive\(path, picture, "dissect"\)/);
    assert.match(ui, />BLUEPRINT<\/button>/);
    assert.match(ui, />DISSECT \/ EXPLODE<\/button>/);
    assert.doesNotMatch(ui, />SIMULATE<\/button>/);
    assert.doesNotMatch(ui, />CAD<\/button>/);
    assert.doesNotMatch(ui, />ENVIRONMENT<\/button>/);
  }],
  ["labels are source-grounded and separate from the picture", () => {
    assert.match(ui, /onSpeak\(p\.name \+ "\. " \+ p\.purpose/);
    assert.match(ui, /v1Parts=\{dive\.pathway\.parts\.map/);
    assert.match(viewer, /v1Parts\?: DesignPart\[\]/);
    assert.match(viewer, /!v1Parts\?\.length\) api\.current\?\.locatePart/);
  }],
  ["no fabricated picture or paid image generation fallback", () => {
    assert.match(route, /ASCENSION_ALLOW_FREE_IMAGES/);
    assert.match(route, /ASCENSION_IMAGE_ENDPOINT/);
    assert.match(route, /throw new Error\("ASCENSION's image engine is not connected/);
    assert.match(route, /No picture was fabricated or purchased/);
    assert.doesNotMatch(route, /https:\/\/api\.openai\.com\/v1\/images/);
  }],
  ["retired ZAI and Lovable endpoints are not invoked", () => {
    assert.doesNotMatch(engine, /https:\/\/api\.z\.ai\//);
    assert.doesNotMatch(engine, /https:\/\/api\.lovable\./);
    assert.match(engine, /max_price: \{ prompt: 0, completion: 0 \}/);
  }],
  ["owner signoff remains unchecked", () => {
    assert.ok(checklist.includes("- [ ]"));
    assert.ok(!checklist.includes("- [x]"));
  }],
];
for(const [name, test] of tests) {
  test();
  process.stdout.write("PASS V1 " + name + "\n");
}
process.stdout.write("Verified " + tests.length + " ASCENSION V1 static contracts (not browser acceptance).\n");
