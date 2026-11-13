import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const adapter = readFileSync('src/lib/ascension/engine/zai.server.ts', 'utf8');
const delivery = readFileSync('src/lib/ascension/engine/delivery.server.ts', 'utf8');

for (const [name, source] of [['adapter', adapter], ['delivery', delivery]]) {
  assert.doesNotMatch(source, /process\.env\[['"](?:LOVABLE_API_KEY|ZAI_API_KEY)['"]\]|process\.env\.(?:LOVABLE_API_KEY|ZAI_API_KEY)|ai\.gateway\.lovable\.dev|api\.z\.ai/, name);
}
assert.match(adapter, /ASCENSION_ALLOW_OPENAI_AI/);
assert.match(adapter, /OPENROUTER_API_KEY/);
assert.match(adapter, /LOCAL_LLM_BASE_URL/);
assert.match(delivery, /callZai/);
console.log('Approved V1 provider boundary checks passed');
