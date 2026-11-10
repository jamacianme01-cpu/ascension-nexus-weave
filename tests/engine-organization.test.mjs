import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "vite";
import { resolve } from "node:path";

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  resolve: { alias: { "@": resolve("src") } },
});
const organization = await server.ssrLoadModule("/src/lib/ascension/engine/organization.ts");
const route = await readFile("src/routes/api/public/ascension/independent.ts", "utf8");
const engage = await readFile("src/components/ascension/independent-engage.tsx", "utf8");
const flow = await readFile("src/components/ascension/designed-flow.tsx", "utf8");

const none = { OpenAI: "unavailable", Claude: "unavailable", Grok: "unavailable" };
const all = { OpenAI: "contributed", Claude: "contributed", Grok: "contributed" };
const claudeOnly = { OpenAI: "unavailable", Claude: "contributed", Grok: "failed" };

assert.equal(organization.leadFor("business"), "Claude");
assert.equal(organization.leadFor("build"), "OpenAI");
assert.equal(organization.leadFor("guidance"), "Grok");
assert.equal(organization.sectionFrom("build"), "build");
assert.equal(organization.sectionFrom("chat"), null);

assert.deepEqual(organization.pathwaySources(), ["ascension", "ascension", "ascension"]);

const fromThree = organization.analystInstructions(null, all);
assert.match(fromThree, /raw inputs/);
assert.match(fromThree, /ASCENSION's own answer/);
assert.match(fromThree, /Do not copy an external answer/);
assert.match(fromThree, /fourth pathway/);
assert.match(fromThree, /not a fifth pathway/);
assert.doesNotMatch(fromThree, /Faithfully structure/);

const fromClaude = organization.analystInstructions("build", claudeOnly);
assert.match(fromClaude, /do not invent an answer for them: OpenAI, Grok/);
assert.match(fromClaude, /components/);
assert.match(fromClaude, /Do not answer with an essay/);

const business = organization.analystInstructions("business", none);
assert.match(business, /Never invent revenue/);
assert.match(business, /Do not invent those providers' answers/);

const guidance = organization.objectiveWork("guidance");
assert.match(guidance, /Do not turn the request into a proposal to build another app/);

assert.equal(organization.withoutProviderNames("Claude worker drone for dementia"), "worker drone for dementia");
assert.equal(organization.knowledgeverseDisposition(true).written, false);
assert.match(organization.knowledgeverseDisposition(true).reason, /not added to the Knowledgeverse/);
assert.match(organization.knowledgeverseDisposition(false).reason, /not a verified outcome/);

const status = organization.providerStatusLine(none, null);
assert.match(status, /Those answers are inputs/);
assert.match(status, /ASCENSION's own/);
assert.match(status, /Recorded memory stays with this user/);
assert.match(fromThree, /Never use another user's memory/);

assert.match(route, /retrieveKnowledge/);
assert.match(route, /EXTERNAL INPUTS/);
assert.match(route, /knowledgeverseDisposition/);
assert.match(route, /Guardian, AutoSync, and verified Delta persistence did not run/);
assert.doesNotMatch(route, /Faithfully structure/);
assert.deepEqual(organization.SECTIONS.map(section => section.label), ["Business Planner", "Build / Create", "Guidance"]);
assert.match(engage, /SECTIONS\.map/);
assert.match(engage, /section \? \{ section \}/);
assert.doesNotMatch(flow, /ChatGPT|Claude|Grok/);

await server.close();
console.log("PASS ASCENSION forms its own pathways from external answers");
