import assert from "node:assert/strict";

const prior = {
  apiKey: process.env.OPENAI_API_KEY,
  enabled: process.env.ASCENSION_ALLOW_OPENAI_AI,
  image: process.env.ASCENSION_ALLOW_FREE_IMAGES,
};
process.env.OPENAI_API_KEY = "test-only-not-a-real-key";
process.env.ASCENSION_ALLOW_OPENAI_AI = "true";
delete process.env.ASCENSION_ALLOW_FREE_IMAGES;
const originalFetch = globalThis.fetch;
let modelCalls = 0;
let inspectedPrompt = "";
const part = (name, primitive, position, scale) => ({
  name, primitive, position, scale, rotation: [0,0,0], material: "steel",
});
const model = {
  title: "Selected worker drone architecture",
  description: "Named assemblies illustrate a proposed multirotor worker drone.",
  hero_rotation: [.15,.2,0],
  hero_scale: 1,
  parts: [
    part("Rotor upper left", "ring", [-1,.5,1], [.6,.08,.6]),
    part("Rotor upper right", "ring", [1,.5,1], [.6,.08,.6]),
    part("Central frame", "box", [0,0,0], [.8,.25,.6]),
    part("Motor assembly", "cylinder", [-1,.2,1], [.13,.17,.13]),
    part("Battery enclosure", "box", [0,-.4,0], [.5,.2,.35]),
    part("Gripper linkage", "cylinder", [0,-.8,.4], [.12,.4,.12]),
  ],
};
function apiResponse(data) {
  return new Response(JSON.stringify({
    status: "completed",
    output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(data) }] }],
  }), { status: 200, headers: { "content-type": "application/json" } });
}
try {
  const { Route } = await import("../src/routes/api/public/ascension/independent.ts");
  const handlers = Route.options?.server?.handlers;
  assert.equal(typeof handlers?.GET, "function");
  assert.equal(typeof handlers?.POST, "function");

  const get = await handlers.GET({
    request: new Request("https://ascension.example/api/public/ascension/independent"),
  });
  const capabilities = await get.json();
  assert.equal(capabilities.picture_generation_enabled, false);
  assert.equal(capabilities.governed_runtime_connected, false);
  process.stdout.write("PASS V1 image capability accurately reports unconnected generator\n");

  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), "https://api.openai.com/v1/responses");
    modelCalls += 1;
    const body = JSON.parse(init.body);
    inspectedPrompt = JSON.stringify(body);
    assert.equal(body.text?.format?.name, "ascension_concept_geometry");
    assert.equal(body.store, false);
    return apiResponse(model);
  };
  const request = new Request("https://ascension.example/api/public/ascension/independent", {
    method: "POST",
    headers: { "content-type": "application/json", host: "ascension.example" },
    body: JSON.stringify({
      phase: "concept",
      objective: "make worker drones",
      pathway: {
        title: "Autonomous quadrotor material-handling drone",
        summary: "A compact quadrotor with a central frame, four rotors, battery enclosure and gripper for small indoor payloads.",
        parts: [
          { name: "Rotor", purpose: "Flight lift", location: "Four arm tips" },
          { name: "Motor", purpose: "Drive rotors", location: "Arm ends" },
          { name: "Central frame", purpose: "Structural support", location: "Center" },
          { name: "Gripper", purpose: "Pick up small loads", location: "Under body" },
        ],
      },
    }),
  });
  const response = await handlers.POST({ request });
  const data = await response.json();
  assert.equal(response.status, 200, JSON.stringify(data));
  assert.equal(data.phase, "concept");
  assert.equal(data.actual_image, false);
  assert.equal(data.verified, false);
  assert.equal(data.model_spec.parts.length, 6);
  assert.match(inspectedPrompt, /worker drones/);
  assert.equal(modelCalls, 1);
  process.stdout.write("PASS V1 selected worker drone generates bounded, unverified 3D concept model\n");

  model.parts = model.parts.map((p,i)=>({...p, name: "Unrelated structure " + i}));
  const unrelated = await handlers.POST({
    request: new Request("https://ascension.example/api/public/ascension/independent", {
      method: "POST", headers: { "content-type": "application/json", host: "ascension.example" },
      body: JSON.stringify({ phase: "concept", objective: "make worker drones",
        pathway: { title: "Quadrotor", summary: "A material handling quadrotor with four motors, rotors and a frame.",
          parts: [{ name: "Rotor" }, {name: "Central frame"}] } }),
    }),
  });
  assert.equal(unrelated.status, 503);
  const failed = await unrelated.json();
  assert.match(failed.error, /did not match the selected components/);
  process.stdout.write("PASS V1 refuses unrelated generated geometry instead of showing a fake invention\n");
} finally {
  globalThis.fetch = originalFetch;
  if (prior.apiKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = prior.apiKey;
  if (prior.enabled === undefined) delete process.env.ASCENSION_ALLOW_OPENAI_AI;
  else process.env.ASCENSION_ALLOW_OPENAI_AI = prior.enabled;
  if (prior.image === undefined) delete process.env.ASCENSION_ALLOW_FREE_IMAGES;
  else process.env.ASCENSION_ALLOW_FREE_IMAGES = prior.image;
}
