import assert from "node:assert/strict";
import { chromium } from "playwright";
const browser=await chromium.launch({
  args:["--enable-webgl","--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"],
});
try {
  const page=await browser.newPage({viewport:{width:1280,height:830}});
  const fatal=[];
  page.on("pageerror",err=>fatal.push(String(err)));
  await page.goto("http://127.0.0.1:4178/tests/fixtures/v1-real-3d-inspection.html");
  const modeled=page.locator(".v1-model-canvas canvas");
  await modeled.waitFor({timeout:30000});
  await page.getByText(/3D model extents:/).waitFor({timeout:30000});
  const before=await modeled.boundingBox();
  assert.ok(before && before.width>350 && before.height>200,
    "The real GLB renderer must have a usable nonzero 3D viewport, not a one-pixel canvas");
  for(const mode of ["blueprint","dissect","exploded","imploded","assembled"]){
    await page.getByRole("button",{name:mode,exact:true}).click();
    await page.waitForFunction(name =>
      document.querySelector("#test-mode")?.textContent===name,mode);
    await page.getByText(/3D model extents:/).waitFor({timeout:30000});
    assert.equal(await page.locator(".v1-design-image-view img").count(),0,
      "A delivered GLB must be inspected in 3D for "+mode);
    assert.equal(await page.locator(".v1-model-canvas canvas").count(),1,
      "The actual delivered GLB must remain viewable in "+mode);
    assert.equal(await page.getByText(/fewer than two separable/).count(),0,
      "Both genuine existing mesh components must remain available");
  }
  await page.getByRole("button",{name:"Rotate delivered model"}).click();
  await page.getByRole("button",{name:"Zoom delivered model"}).click();
  assert.equal(await page.locator(".v1-model-canvas canvas").count(),1);
  await page.getByRole("button",{name:"Remove test GLB"}).click();
  await page.getByRole("button",{name:"dissect",exact:true}).click();
  await page.getByText("A delivered 3D model is required for dissect. A flat image is not a 3D inspection.").waitFor();
  assert.equal(await page.locator(".v1-design-image-view img").count(),0,
    "Missing GLB must not substitute the 2D concept drawing for Dissect");
  await page.getByRole("button",{name:"assembled",exact:true}).click();
  await page.locator(".v1-design-image-view img").waitFor();
  assert.deepEqual(fatal,[],"The real 3D inspection must not crash the page");
  console.log("PASS: real exported nested GLB is rendered and measured with usable WebGL canvas, 3D Dissect/Explode/Implode and orbit inputs; no false 2D fallback.");
} finally { await browser.close(); }
