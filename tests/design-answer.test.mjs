import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const code = ts.transpileModule(readFileSync(new URL("../src/lib/ascension/design-answer.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { asCompletedDesignStep, freePictureEnabled } = await import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));

assert.equal(
  asCompletedDesignStep("The carriage rides one horizontal electromagnetic track."),
  "The carriage rides one horizontal electromagnetic track.",
);
assert.match(
  asCompletedDesignStep("Research battery chemistry before choosing a pack."),
  /^This design already uses battery chemistry/i,
);
assert.match(asCompletedDesignStep("Define your requirements."), /provisional choice/);
assert.equal(asCompletedDesignStep("Start by identifying the coil pitch along the rail."), "This design already uses the coil pitch along the rail.");
assert.equal(freePictureEnabled({}), true);
assert.equal(freePictureEnabled({ allow: "false" }), false);
assert.equal(freePictureEnabled({ endpoint: "https://images.example/paid" }), false);
assert.equal(freePictureEnabled({ allow: "true", endpoint: "https://images.example/paid" }), true);
console.log("design answer tests passed");
