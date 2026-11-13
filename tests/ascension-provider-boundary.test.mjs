import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const adapter = readFileSync(resolve(root, "src/lib/ascension/engine/zai.server.ts"), "utf8");
const delivery = readFileSync(resolve(root, "src/lib/ascension/engine/delivery.server.ts"), "utf8");

for (const [name, source] of [["inference adapter", adapter], ["delivery engine", delivery]]) {
  assert.doesNotMatch(source, /LOVABLE_API_KEY|ASCENSION_ALLOW_LOVABLE_AI|LOVABLE_BASE_URL|hasLovableAi/i, name + " must not select Lovable");
  assert.doesNotMatch(source, /ZAI_API_KEY|ZAI_BASE_URL|ZAI_FREE_TEXT_MODEL|ZAI_FREE_VISION_MODEL|hasZaiFree|zai_free/i, name + " must not select Z.AI");
}
assert.match(adapter, /ASCENSION_ALLOW_OPENAI_AI/, "authorized OpenAI adapter must remain");
assert.match(adapter, /OPENROUTER_API_KEY/, "free cloud adapter must remain");
assert.match(adapter, /LOCAL_LLM_BASE_URL/, "explicit local adapter must remain");
assert.match(delivery, /buildGuideFallbackDelivery/, "existing fallback delivery must remain");
console.log("ASCENSION provider boundaries verified");
