import assert from "node:assert/strict";
import { chromium } from "playwright";

const browser=await chromium.launch({args:["--enable-unsafe-swiftshader","--use-gl=angle","--use-angle=swiftshader"]});
try {
  const page=await browser.newPage({viewport:{width:1100,height:760},reducedMotion:"reduce"});
  page.setDefaultTimeout(12000);
  const errors=[];
  const calls=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.addInitScript(()=>{
    window.__treeSpoken=[];
    Object.defineProperty(window,"speechSynthesis",{configurable:true,value:{
      cancel(){},speak(utterance){window.__treeSpoken.push(utterance.text);
        queueMicrotask(()=>{utterance.onstart?.();utterance.onend?.();});}
    }});
    window.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
  });
  const path=(id,title,summary,parts)=>({
    id,title,summary,
    steps:["Build the core structure and mount supported parts","Connect power and control","Inspect placement before any fabrication"],
    tradeoffs:["Dimensions and forces remain unverified"],parts
  });
  const droneParts=[
    {name:"Rotor",purpose:"Provides lift and steering",location:"Ends of the airframe arms"},
    {name:"Battery",purpose:"Supplies electrical power",location:"Central body"},
    {name:"Work tool",purpose:"Handles objects",location:"Underside of the airframe"}
  ];
  const linearParts=[
    {name:"Coil station",purpose:"Produces controlled electromagnetic force",location:"Surrounding the track"},
    {name:"Guide rail",purpose:"Guides translator movement",location:"Along the propulsion path"},
    {name:"Translator carriage",purpose:"Transfers force to the moving load",location:"Slides along the guide rails"}
  ];
  await page.route("**/api/public/ascension/independent",async route=>{
    const request=route.request();
    const input=request.method()==="POST"?request.postDataJSON():{};
    const phase=request.method()==="GET"?"capability":input?.phase;
    calls.push(phase);
    const isLinear=(input?.objective||"").includes("linear propulsion");
    let body;
    if(phase==="capability") body={picture_generation_enabled:true,providers:{OpenAI:true}};
    else if(phase==="initial")body={phase:"initial",answer:"Private engineering evaluation with constraints and candidate components"};
    else if(phase==="pathways")body=isLinear?{
      introduction:"Four engineered directions",pathways:[
        path("linear1","Linear propulsion with three coil stations","Electromagnetic linear propulsion uses staged coil stations, three guidance rails and a translator carriage.",linearParts),
        path("linear2","Modular magnetic track architecture","A guided electromagnetic translator travels on a linear track with coil stages.",linearParts),
        path("linear3","Rail and coil propulsion architecture","A controlled electromagnetic drive moves a carriage along supported rails.",linearParts)
      ],
      blend:{...path("linear4","BLEND linear propulsion system","Combines track guidance, coils and translator carriage in one architecture.",linearParts),blend_reason:"Consolidated approach"},
      verified:false,contributors:["OpenAI"],unavailable:[],providerErrors:[],mode:"test",governance:"unverified",persistence:"not persisted"
    }:{
      introduction:"Four engineered directions",pathways:[
        path("rotor","Rotorcraft-based Multirotor Worker Drone with Edge AI","Multirotor worker drone with four lift rotors, battery, sensors, airframe and gripper.",droneParts),
        path("rover","Ground Rover Worker Drone with Modular Tooling","Wheeled ground rover with traction wheels, modular tool and obstacle sensor.",droneParts),
        path("modular","Modular worker drone platform","Worker drone with interchangeable four-rotor modules and grip tool.",droneParts)
      ],
      blend:{...path("blend","Adaptive modular worker drone team","Multirotor worker drones with modular gripper tool and coordinated sensing.",droneParts),blend_reason:"A blended modular architecture"},
      verified:false,contributors:["OpenAI"],unavailable:[],providerErrors:[],mode:"test",governance:"unverified",persistence:"not persisted"
    };
    else if(phase==="guide")body={phase:"guide",answer:"The battery powers the rotor drive and the gripper serves as the work tool."};
    else body={error:"Unexpected API phase in canonical viewer "+phase};
    await route.fulfill({status:body.error?503:200,contentType:"application/json",body:JSON.stringify(body)});
  });
  const res=await page.goto(process.env.ASCENSION_BASE_URL||"http://127.0.0.1:4174/",{waitUntil:"domcontentloaded"});
  assert.equal(res?.status(),200);
  await page.locator('img[src="/approved-scene/ascension-tree-behind-book-hq.jpg"]').waitFor();
  await page.locator("#objective").fill("make worker drones");
  await page.getByRole("button",{name:"ENGAGE ASCENSION"}).click();
  await page.getByRole("tab").first().waitFor();
  assert.equal(await page.getByRole("tab").count(),4);

  const detail=page.locator('section[aria-label="Selected pathway design"]');
  const canvas=page.locator('canvas[aria-label^="Rotatable, zoomable, component-selectable"]');
  async function canonical(kindName,fullInspection=false) {
    console.log("ENTER canonical scene: "+kindName);
    await detail.waitFor({state:"visible"});
    await canvas.waitFor({state:"visible",timeout:20000});
    console.log("CANVAS ready "+kindName);
    if (process.env.V1_CAPTURE === "1" && (kindName === "Rotor" || kindName === "Coil station") && !globalThis["__captured_" + kindName.replace(/ /g,"_")]) {
      globalThis["__captured_" + kindName.replace(/ /g,"_")] = true;
      await page.waitForTimeout(650);
      const jpeg = await canvas.screenshot({type:"jpeg",quality:50,animations:"disabled"});
      console.log("V1_VISUAL_"+kindName.replace(/ /g,"_")+":"+jpeg.toString("base64"));
    }
    await page.getByRole("button",{name:"BLUEPRINT",exact:true}).click();
    await page.locator('[aria-label="Canonical 3D invention assembly"][data-mode="blueprint"]').waitFor();
    console.log("BLUEPRINT mode ready "+kindName);
    const sameCanvas=await canvas.evaluate(el=>{
      window.__canonicalCanvas=el;return el.width>=200&&el.height>=300;
    });
    assert.equal(sameCanvas,true,"Canvas must have renderable dimensions");
    await page.getByRole("button",{name:"DISSECT / EXPLODE",exact:true}).click();
    await page.locator('[aria-label="Canonical 3D invention assembly"][data-mode="dissect"]').waitFor();
    assert.equal(await canvas.evaluate(el=>el===window.__canonicalCanvas),true,"Dissect must preserve the SAME 3D model/canvas");
    console.log("EXPLODE preserves source "+kindName);
    await page.getByRole("button",{name:"IMPLODE / REASSEMBLE",exact:true}).click();
    await page.locator('[aria-label="Canonical 3D invention assembly"][data-mode="assembled"]').waitFor();
    assert.equal(await canvas.evaluate(el=>el===window.__canonicalCanvas),true,"Reassembly must preserve object identity");
    assert.equal(calls.filter(x=>x==="picture").length,0,"Switching views must not regenerate or rate-limit images");
    if(fullInspection) {
    await page.getByRole("button",{name:"ZOOM IN"}).click();
    await page.getByRole("button",{name:"ROTATE RIGHT"}).click();
    await page.getByRole("button",{name:"LABELS",exact:true}).click();
    await page.locator('[aria-label="Selectable components"]').getByRole("button",{name:new RegExp(kindName)}).first().click();
    assert.ok(await page.getByText(/WHAT:/).count());
    await page.getByRole("button",{name:"MOVE RIGHT"}).click();
    await page.getByRole("button",{name:"HIDE PART"}).click();
    await page.getByRole("button",{name:"RESTORE PART"}).click();
    await page.getByRole("button",{name:"DISSECT / EXPLODE"}).click();
    await page.getByRole("button",{name:"IMPLODE / REASSEMBLE"}).click();
    assert.equal(await canvas.evaluate(el=>el===window.__canonicalCanvas),true,"Model edits must keep one canvas");
    await page.getByRole("button",{name:"DIVE INTO REALITY"}).click();
    await page.getByRole("button",{name:"CLOSE REALITY VIEW"}).waitFor();
    await page.getByRole("button",{name:"CLOSE REALITY VIEW"}).click();
    assert.equal(await detail.count(),1,"Immersive view must close to the SAME selected pathway");
    }
    console.log("PASS modeled pathway: "+kindName+"; modes share one model canvas");
  }
  console.log("PATHWAYS returned four selectable designs");
  await page.getByRole("tab").first().click();
  await canonical("Rotor",true);
  await detail.getByRole("button",{name:/BACK TO PATHWAYS/}).click();
  await page.waitForTimeout(850);
  await page.getByRole("tab").nth(1).click();
  await canonical("Driven wheel");
  await detail.getByRole("button",{name:/BACK TO PATHWAYS/}).click();
  await page.waitForTimeout(850);
  await page.getByRole("tab").nth(2).click();
  await canonical("Rotor");
  await detail.getByRole("button",{name:/BACK TO PATHWAYS/}).click();
  await page.waitForTimeout(850);
  await page.getByRole("tab").nth(3).click();
  await canonical("Rotor");
  await detail.getByRole("button",{name:/BACK TO PATHWAYS/}).click();
  await page.waitForTimeout(850);

  await page.getByRole("button",{name:"New objective"}).click();
  await page.locator("#objective").fill("make a linear propulsion engine");
  await page.getByRole("button",{name:"ENGAGE ASCENSION"}).click();
  await page.getByRole("tab").first().waitFor();
  await page.getByRole("tab").first().click();
  await canonical("Coil station",true);
  assert.equal(calls.filter(x=>x==="picture").length,0);
  assert.equal(await page.getByText("Too many objectives. Try again later.").count(),0);
  assert.equal(errors.length,0,errors.join(" | "));
  console.log("PASS V1 canonical browser: worker drone, rover, 4 paths, linear propulsion; one live 3D model for assemble/blueprint/explode/reassemble, selectable components, zoom, immersive view, no regeneration");
} finally {
  await browser.close();
}
