import assert from "node:assert/strict";
// Real hosted-provider acceptance. One generic non-sensitive subject, no paid keys.
const origin = process.env.ASCENSION_BASE_URL || "https://ascension-nexus-weave-production.up.railway.app/";
const url = new URL("/api/public/ascension/independent", origin);
const capabilities = await fetch(url, {signal:AbortSignal.timeout(15000)});
assert.equal(capabilities.status, 200, "Image-capability endpoint must be available");
const capability = await capabilities.json();
assert.equal(capability.picture_generation_enabled, true, "No-cost image engine must be connected");
const pathway = {
  title: "Mobility-first floor-cleaner architecture",
  summary: "Compact four-wheel robotic floor-cleaner with enclosed vacuum motor, front cleaning brushes, rechargeable battery, obstacle sensing and compact LiDAR tower.",
  steps: ["Four powered wheels","Front rotating brushes and suction nozzle","LiDAR sensor mounted over central housing"],
  parts: [
    {name: "Driven wheel motors",purpose: "Move the platform",location: "Chassis corners"},
    {name: "Cleaning brushes",purpose: "Collect debris",location: "Forward underside"},
    {name: "LiDAR tower",purpose: "Obstacle mapping",location: "On top"}
  ]
};
for (const [index, view] of ["assembled","blueprint","dissect"].entries()) {
  if(index) await new Promise(resolve=>setTimeout(resolve,45000));
  const response = await fetch(url, {
    method: "POST",
    signal: AbortSignal.timeout(135000),
    headers: {"content-type":"application/json"},
    body: JSON.stringify({
      objective: "make one autonomous industrial floor cleaning robot",
      phase: "picture", view, pathway
    })
  });
  if(response.status!==200){
    const body=(await response.text()).slice(0,600);
    throw new Error("Hosted " + view + " image generation failed, HTTP "+response.status+": "+body);
  }
  const image = await response.json();
  assert.match(image.image_url,/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]{4000,12000000}$/i);
  const match=image.image_url.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/i);
  const raw=Buffer.from(match[2],"base64");
  assert.ok(raw.length>4000 && raw.length<9000000,"Actual image bytes are bounded");
  const png=raw.subarray(0,4).equals(Buffer.from([137,80,78,71]));
  const jpeg=raw.subarray(0,3).equals(Buffer.from([255,216,255]));
  const webp=raw.subarray(0,4).toString()==="RIFF"&&raw.subarray(8,12).toString()==="WEBP";
  assert.ok(png||jpeg||webp,"Generated image must be a real PNG, JPEG, or WebP");
  console.log("PASS live ASCENSION "+view+" generation: real no-charge image "+raw.length+" bytes");
}
