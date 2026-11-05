import assert from "node:assert/strict";
import { chromium } from "playwright";

// Two physically distinct named triangles make a valid GLB; unlike a picture,
// its identity and vertices can be checked across every inspection view.
function fixtureGlb(){
  const triangles=new Float32Array([
    -1,-.2,0, -.2,.8,0, -.2,-.2,.6,
    .2,-.2,0, 1,.8,0, 1,-.2,.6,
  ]);
  const binary=Buffer.from(triangles.buffer);
  const document={
    asset:{version:"2.0",generator:"ASCENSION Hunyuan3D transport test"},
    buffers:[{byteLength:binary.length}],
    bufferViews:[
      {buffer:0,byteOffset:0,byteLength:36,target:34962},
      {buffer:0,byteOffset:36,byteLength:36,target:34962},
    ],
    accessors:[
      {bufferView:0,componentType:5126,count:3,type:"VEC3",min:[-1,-.2,0],max:[-.2,.8,.6]},
      {bufferView:1,componentType:5126,count:3,type:"VEC3",min:[.2,-.2,0],max:[1,.8,.6]},
    ],
    materials:[{doubleSided:true,pbrMetallicRoughness:{baseColorFactor:[0.6,0.8,1,1],metallicFactor:0,roughnessFactor:1}}],
    meshes:[
      {primitives:[{attributes:{POSITION:0},material:0}]},
      {primitives:[{attributes:{POSITION:1},material:0}]},
    ],
    nodes:[
      {mesh:0,name:"Hunyuan rotor mesh"},
      {mesh:1,name:"Hunyuan payload mesh"},
    ],
    scenes:[{nodes:[0,1]}],scene:0,
  };
  let json=Buffer.from(JSON.stringify(document),"utf8");
  json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);
  const total=12+8+json.length+8+binary.length;
  const out=Buffer.alloc(total);
  out.write("glTF",0);out.writeUInt32LE(2,4);out.writeUInt32LE(total,8);
  out.writeUInt32LE(json.length,12);out.write("JSON",16);json.copy(out,20);
  const at=20+json.length;
  out.writeUInt32LE(binary.length,at);out.write("BIN\0",at+4);binary.copy(out,at+8);
  return out;
}

const browser=await chromium.launch({channel:process.env.ASCENSION_BROWSER_CHANNEL||undefined,args:["--enable-unsafe-swiftshader","--use-gl=angle","--use-angle=swiftshader"]});
try{
  const page=await browser.newPage({viewport:{width:1100,height:800},reducedMotion:"reduce"});
  page.setDefaultTimeout(16000);
  const errors=[];
  const generated=[];
  const guideRequests=[];
  const creationPhases=[];
  page.on("pageerror",e=>errors.push(e.message));
  page.on("console",msg=>{if(msg.type()==="error")console.log("BROWSER ERROR: "+msg.text().slice(0,500));});
  const mockBytes=fixtureGlb();
  const mockImage=await page.evaluate(()=>{
    const c=document.createElement("canvas");c.width=64;c.height=64;
    const ctx=c.getContext("2d"),pixels=ctx.createImageData(64,64);
    let seed=321;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed>>>24;};
    for(let i=0;i<pixels.data.length;i+=4){pixels.data[i]=random();pixels.data[i+1]=random();pixels.data[i+2]=random();pixels.data[i+3]=255;}
    ctx.putImageData(pixels,0,0);return c.toDataURL("image/png").split(",")[1];
  });
  await page.addInitScript((b64)=>{
    window.__localHunyuanCalls=[];window.__treeSpeech=[];
    const realFetch=window.fetch.bind(window);
    window.fetch=async(input,init)=>{
      const url=typeof input==="string"?input:input instanceof Request?input.url:String(input);
      if(!url.startsWith("http://127.0.0.1:8082/"))return realFetch(input,init);
      window.__localHunyuanCalls.push(url);
      if(url.endsWith("/status"))
        return new Response(JSON.stringify({ready:true,engine:"Hunyuan3D",source:"owner-local"}),{
          status:200,headers:{"content-type":"application/json"}
        });
      if(url.endsWith("/generate")){
        const body=JSON.parse(init?.body??"{}");
        if(typeof body.image!=="string"||body.image.length<4000)
          return new Response(JSON.stringify({error:"Invalid reference image"}),{status:400});
        const decoded=atob(b64);
        const bytes=Uint8Array.from(decoded,c=>c.charCodeAt(0));
        return new Response(bytes,{status:200,headers:{"content-type":"model/gltf-binary"}});
      }
      return new Response("unrecognized route",{status:404});
    };
    Object.defineProperty(window,"speechSynthesis",{configurable:true,value:{
      getVoices(){return [{name:"Microsoft Aria Online (Natural)",lang:"en-US"}]},cancel(){},speak(utterance){window.__treeSpeech.push(utterance.text);queueMicrotask(()=>{
        utterance.onstart?.();utterance.onend?.();
      });}
    }});
    window.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
  },mockBytes.toString("base64"));

  const path=(id,title,summary,parts)=>({
    id,title,summary,
    steps:["Build the core structure","Configure power and navigation","Validate the mechanical layout"],
    tradeoffs:["Dimensions remain unverified"],parts
  });
  const droneParts=[
    {name:"Rotor",purpose:"Lift",location:"Airframe ends"},
    {name:"Gripper",purpose:"Move materials",location:"Underside"},
  ];
  const linearParts=[
    {name:"Coil",purpose:"Electromagnetic drive",location:"Track"},
    {name:"Translator",purpose:"Moves along rails",location:"Rail center"},
  ];
  await page.route("**/api/public/ascension/independent",async route=>{
    const req=route.request(),input=req.method()==="POST"?req.postDataJSON():{};
    const phase=req.method()==="GET"?"capability":input.phase;
    if(phase==="initial" || phase==="pathways") creationPhases.push(phase);
    const linear=String(input.objective??"").includes("linear propulsion");
    const finance=String(input.objective??"").includes("my finances");
    let body;
    if(phase==="capability")body={picture_generation_enabled:true};
    else if(phase==="initial")body={phase:"initial",answer:"Private engineering analysis"};
    else if(phase==="picture"){
      generated.push({id:input.pathway?.id,view:input.view});
      body={image_url:"data:image/png;base64,"+mockImage,verified:false};
    }
    else if(phase==="pathways")body=finance?{
      experience:"guidance",introduction:"Financial choices",
      pathways:[path("bills","Handle immediate bills","Start with essential bills and their due dates.",[]),path("budget","Steady your cash flow","Match regular income to necessary spending.",[]),path("priorities","Choose your money priorities","Compare priorities and a manageable next action.",[])],
      blend:{...path("blend","Combine urgent relief and a steady plan","Address the next bill and create a sustainable spending plan.",[]),blend_reason:"Combine immediate and ongoing needs"}
    }:linear?{
      introduction:"Design choices",
      pathways:[
        path("linear1","Three coil drive","Linear propulsion uses staged electromagnetic coils.",linearParts),
        path("linear2","Segmented translator","Linear propulsion uses a modular track.",linearParts),
        path("linear3","Rail controlled path","Linear motor with managed motion.",linearParts)
      ],
      blend:{...path("linear4","BLEND propulsion","Integrated linear motor drive.",linearParts),blend_reason:"Combined"},
      verified:false,contributors:["OpenAI"],unavailable:[],providerErrors:[],governance:"unverified"
    }:{
      experience:"guidance", // Deliberately wrong: the client must keep inventions in their viewer.
      introduction:"Design choices",
      pathways:[
        path("rotor","Rotorcraft Worker Drone","Four rotors carry a payload gripper.",droneParts),
        path("rover","Ground Rover Worker Drone","Ground robot drives by wheels.",droneParts),
        path("modular","Modular Worker Drone","Swappable multirotor work tool.",droneParts)
      ],
      blend:{...path("blend","BLEND modular team","Coordinated drones with interchangeable tools.",droneParts),blend_reason:"Combined"},
      verified:false,contributors:["OpenAI"],unavailable:[],providerErrors:[],governance:"unverified"
    };
    else if(phase==="guide"){guideRequests.push(input);body={phase:"guide",answer:"Inspect the selected source geometry."};}
    else body={error:"Unexpected phase "+phase};
    await route.fulfill({status:body.error?503:200,contentType:"application/json",body:JSON.stringify(body)});
  });
  const res=await page.goto(process.env.ASCENSION_BASE_URL||"http://127.0.0.1:4174/",{
    waitUntil:"domcontentloaded",
  });
  assert.equal(res?.status(),200);
  const hero=page.locator('img[src="/approved-scene/ascension-tree-behind-book-hq.jpg"]');
  await hero.waitFor();
  for(const name of ["Glossary","Library Card","Inspect","Knowledgeverse"])
    assert.equal(await page.locator("header").getByText(name,{exact:true}).count(),0,"V1 header excludes "+name);
  const entry=page.getByRole("region",{name:"Engage ASCENSION"});
  await entry.waitFor({state:"visible"});
  await page.getByRole("button",{name:"Hear the Tree",exact:true}).click();
  assert.ok(await page.evaluate(()=>window.__treeSpeech.some(s=>s.startsWith("Welcome to ASCENSION"))));
  if(process.env.ASCENSION_FINANCE_ONLY){
    await page.locator("#objective").fill("I need help with my finances");
    await page.getByRole("button",{name:"ENGAGE ASCENSION"}).click();
    await page.getByRole("tab").first().waitFor();
    await enterOrb(0);
    await page.getByRole("region",{name:"Selected guidance pathway"}).waitFor();
    await page.getByRole("log").getByText("Selected pathway",{exact:false}).last().waitFor();
    assert.equal(generated.length,0,"Financial guidance must not request any picture");
    assert.equal(await page.locator("canvas").count(),0);
    assert.equal(await page.getByRole("button",{name:"CONNECT LOCAL 3D",exact:true}).count(),0);
    assert.equal(await page.getByRole("button",{name:"BLUEPRINT",exact:true}).count(),0);
    assert.equal(await page.getByRole("heading",{name:"PARTS",exact:true}).count(),0);
    assert.equal(await page.evaluate(()=>window.__localHunyuanCalls.length),0,"Guidance cannot contact a local engine");
    assert.equal(guideRequests.at(-1).pathway.experience,"guidance","The Tree receives the correct conversation context");
    await page.getByRole("heading",{name:"Your first steps",exact:true}).waitFor();
    await page.screenshot({path:"C:/Users/Gordo/.codex/tmp/ascension-feedback-check/finance-guidance-fixture.png",fullPage:true});
    console.log("PASS finance guidance: four spoken choices, practical plan and guide, zero image/3D/local-device requests");
    await browser.close();process.exit(0);
  }
  await page.locator("#objective").fill("make worker drones");
  await page.getByRole("button",{name:"ENGAGE ASCENSION"}).click();
  await page.getByRole("tab").first().waitFor();
  await page.locator('img[alt^="Concept picture of"]').first().waitFor();
  assert.ok(generated.some(item=>item.id==="blend"),"The finished design picture loads with the answer");
  assert.equal(await page.getByRole("tab").count(),4);
  assert.deepEqual(creationPhases,["pathways"],"ENGAGE must reveal choices after one synthesis request, without waiting for a preliminary essay");
  assert.equal(await page.getByText("INITIAL ANSWER",{exact:true}).count(),0);
  assert.equal(await page.getByText("THREE PATHWAYS + FOURTH BLEND",{exact:true}).count(),0);
  assert.equal(await page.getByRole("region",{name:"Initial objective answer"}).count(),0);
  await entry.waitFor({state:"hidden"});
  await page.getByRole("region",{name:"Pathways around the Tree of Knowledge"}).screenshot({path:"C:/Users/Gordo/.codex/tmp/ascension-feedback-check/carousel-desktop.png"});
  await page.getByRole("button",{name:"Next pathway",exact:true}).click();
  assert.equal(await page.getByRole("tab").nth(1).getAttribute("aria-selected"),"true");
  await page.getByRole("button",{name:"Previous pathway",exact:true}).click();
  assert.equal(await page.getByRole("tab").first().getAttribute("aria-selected"),"true");
  async function enterOrb(index){
    const count=generated.length;
    const orb=page.getByRole("tab").nth(index);
    const title=(await orb.getAttribute("aria-label")).replace("Hear about ","");
    await orb.click();
    await page.getByRole("button",{name:"ENTER PATHWAY",exact:true}).waitFor();
    await page.waitForFunction(title=>window.__treeSpeech.join(" ").includes(title),title);
    assert.equal(generated.length,count,"Listening to an orb must not generate its image");
    assert.equal(await page.getByRole("region",{name:"Selected pathway design"}).count(),0,"The orb speaks before entering the world");
    await page.getByRole("button",{name:"ENTER PATHWAY",exact:true}).click();
  }

  if(process.env.ASCENSION_CAROUSEL_ONLY){
    const carousel=page.getByRole("region",{name:"Pathways around the Tree of Knowledge"});
    await carousel.focus();await page.keyboard.press("ArrowRight");
    assert.equal(await page.getByRole("tab").nth(1).getAttribute("aria-selected"),"true");
    await page.waitForFunction(()=>document.activeElement?.getAttribute("data-design-index")==="1");
    await page.setViewportSize({width:390,height:844});await page.waitForTimeout(450);
    await carousel.screenshot({path:"C:/Users/Gordo/.codex/tmp/ascension-feedback-check/carousel-mobile.png"});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await enterOrb(1);
    await page.getByRole("region",{name:"Selected pathway design"}).waitFor();
    await page.getByRole("button",{name:/BACK TO PATHWAYS/}).click();
    await carousel.waitFor();
    assert.equal(await page.getByRole("tab").nth(1).getAttribute("aria-selected"),"true","Back preserves carousel position");
    assert.equal(errors.length,0,errors.join(" | "));
    console.log("PASS Tree carousel: desktop/mobile, keyboard focus, four pathways, separate inspection screen and preserved return position");
  }else{
  const detail=page.locator('section[aria-label="Selected pathway design"]');
  const canvas=page.locator('canvas[aria-label^="Hunyuan3D generated mesh"]');
  const stages=["BLUEPRINT","DISSECT / EXPLODE","IMPLODE / REASSEMBLE"];
  async function inspect(expectedId){
    await detail.waitFor({state:"visible"});
    assert.equal(await detail.getByRole("region",{name:"Choose your next step"}).count(),0,"Inventions must not turn into a written action-plan panel");
    assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('.ascension-world'),'::before').opacity),"0.16","The Tree becomes faint inside the selected world");
    await detail.getByRole("log").getByText("Selected pathway",{exact:false}).last().waitFor();
    const picture=page.locator('img[alt^="Concept picture of"]');
    await picture.waitFor({state:"visible"});
    if(await page.getByRole("button",{name:"CONNECT LOCAL 3D",exact:true}).count()){
      if(expectedId==="rotor")assert.equal(await page.evaluate(()=>window.__localHunyuanCalls.length),0,"Opening a pathway must never probe the device before explicit connection");
      await page.getByRole("button",{name:"CONNECT LOCAL 3D",exact:true}).click();
    }
    await page.getByRole("button",{name:"BLUEPRINT",exact:true}).waitFor({state:"visible"});
    await page.waitForFunction(()=>{const b=[...document.querySelectorAll("button")].find(b=>b.textContent==="BLUEPRINT");return b&&!b.disabled;});
    assert.equal(await canvas.count(),0,"GLB arrival must not replace the invention picture");
    const original=await picture.getAttribute("src");
    await page.getByRole("button",{name:"ASSEMBLED",exact:true}).click();
    assert.equal(await picture.getAttribute("src"),original,"Assembled must preserve the clear reference");
    await page.getByRole("button",{name:"BLUEPRINT",exact:true}).click();
    await canvas.waitFor({state:"visible",timeout:16000});
    assert.equal(await page.getByRole("img",{name:"Selected design reference",exact:true}).getAttribute("src"),original,"3D study must retain the source reference");
    await page.locator('[aria-label="One real Hunyuan3D model"][data-mode="blueprint"]').waitFor();
    console.log("V1 DIAGNOSTIC "+expectedId,JSON.stringify({
      detail: (await detail.innerText()).slice(0,500),
      canvasCount: await canvas.count(),
      local: await page.evaluate(()=>window.__localHunyuanCalls),
      errors: errors.slice(-4),
    }));
    await page.waitForTimeout(200);
    await canvas.screenshot({path:(process.env.ASCENSION_SCREENSHOT_DIR||"C:/Users/Gordo/.codex/tmp/ascension-feedback-check")+"/blueprint-"+expectedId+".png"});
    const preserved=await canvas.evaluate(el=>{window.__realMesh=el;return el.width>200;});
    assert.ok(preserved);
    await page.getByRole("button",{name:"3D VIEW",exact:true}).click();
    await page.waitForTimeout(200);
    let assembledPixels=await canvas.screenshot();
    await page.getByRole("button",{name:"TOP",exact:true}).click();
    await page.waitForTimeout(200);
    assert.ok(!(await canvas.screenshot()).equals(assembledPixels),"Top view changes the real model camera");
    await page.getByRole("button",{name:"PERSPECTIVE",exact:true}).click();
    await page.waitForTimeout(200);

    assembledPixels=await canvas.screenshot();
    await page.getByRole("button",{name:"DISSECT / EXPLODE",exact:true}).click();
    await page.locator('[aria-label="One real Hunyuan3D model"][data-mode="dissect"]').waitFor();
    assert.equal(await canvas.evaluate(el=>el===window.__realMesh),true,
      "Dissect must reuse the actual Hunyuan GLB canvas");
    await page.waitForTimeout(200);
    assert.ok(!(await canvas.screenshot()).equals(assembledPixels),"Explosion must actually separate geometry");
    await page.getByRole("button",{name:"IMPLODE / REASSEMBLE",exact:true}).click();
    await page.locator('[aria-label="One real Hunyuan3D model"][data-mode="assembled"]').waitFor();
    assert.equal(await canvas.evaluate(el=>el===window.__realMesh),true,
      "Reassemble must not regenerate another design");
    await page.waitForTimeout(200);
    assert.ok((await canvas.screenshot()).equals(assembledPixels),"Implosion must restore the original assembly");
    if(expectedId==="rotor"){
      const question=detail.getByRole("textbox",{name:"Ask the Tree"});
      await question.fill("Why that rotor?");await detail.getByRole("button",{name:"ASK",exact:true}).click();
      await detail.getByRole("log").getByText("Inspect the selected source geometry.",{exact:false}).last().waitFor();
      await detail.getByRole("log").getByText("Why that rotor?",{exact:false}).waitFor();
      await question.fill("What about endurance?");await detail.getByRole("button",{name:"ASK",exact:true}).click();
      await page.waitForFunction(()=>[...document.querySelectorAll('[role="log"] p')].some(p=>p.textContent.includes("What about endurance?")));
      assert.ok(guideRequests.at(-1).history.some(item=>item.content==="Why that rotor?"),"Follow-ups retain conversation context");
      assert.equal(guideRequests.at(-1).alternatives.length, 4, "Tree can compare every supplied pathway");
      assert.ok(guideRequests.at(-1).alternatives.every(option => option.title && option.summary && option.tradeoffs.length), "Comparisons include each choice's actual tradeoffs");
      assert.deepEqual(guideRequests.at(-1).pathway.tradeoffs, ["Dimensions remain unverified"]);
    }
    const focusedReply=page.waitForResponse(response=>{
      if(!response.url().includes('/api/public/ascension/independent')||response.request().method()!=="POST")return false;
      const input=response.request().postDataJSON();return input.phase==="guide"&&Boolean(input.pathway?.focused_part);
    });
    await page.getByRole("button",{name:/^(Rotor|Coil)$/,exact:true}).click();
    const explanation=detail.getByRole("status",{name:"Selected component explanation"});
    await explanation.waitFor();
    const explanationText=await explanation.innerText();
    assert.match(explanationText,/What it does:/,"Selecting a part shows its real designed purpose immediately");
    assert.match(explanationText,/Where it belongs:/,"Selecting a part shows the intended design location");
    assert.match(explanationText,/(Lift|Electromagnetic drive)/,"The explanation comes from the selected pathway, not invented geometry");
    assert.match(explanationText,/(Airframe ends|Track)/,"Intended location is shown from pathway data");
    assert.match(explanationText,/not verified in the picture/,"Unmapped pixels are not presented as located components");
    const focusedRequest=(await focusedReply).request().postDataJSON();
    assert.match(focusedRequest.pathway.focused_part.name,/Rotor|Coil/);
    assert.equal(focusedRequest.pathway.part_located,false,"Unnamed geometry must not be treated as a located part");
    assert.equal(focusedRequest.pathway.location_source,"unlocated");
    assert.equal(await page.getByRole("button",{name:"DESCRIPTION",exact:true}).count(),0,"Part explanation belongs to the spoken selection, not a separate tab");
    assert.ok(await page.evaluate(()=>window.__treeSpeech.some(text=>text.includes("Inspect the selected source geometry."))),"Selected-part explanation is spoken");
    await page.getByText("Inspect model geometry",{exact:true}).click();
    await page.getByRole("button",{name:"Hunyuan rotor mesh"}).click();
    await page.getByRole("button",{name:"MOVE RIGHT"}).click();
    await page.getByRole("button",{name:"ZOOM IN"}).click();
    assert.equal(await page.getByRole("button",{name:"DIVE INTO REALITY"}).count(),0,"Dive belongs outside V1");
    assert.equal(await detail.count(),1);
    await page.getByRole("button",{name:"Return to the design reference",exact:true}).click();
    await picture.waitFor({state:"visible"});
    if(await page.getByRole("button",{name:"CONNECT LOCAL 3D",exact:true}).count()){
      if(expectedId==="rotor")assert.equal(await page.evaluate(()=>window.__localHunyuanCalls.length),0,"Opening a pathway must never probe the device before explicit connection");
      await page.getByRole("button",{name:"CONNECT LOCAL 3D",exact:true}).click();
    }
    assert.equal(await picture.getAttribute("src"),original,"Picture identity survives all model views");
    assert.equal(await detail.getByText("Hunyuan3D mesh ready").count(),0);
    assert.equal(await page.locator('canvas[aria-label^="Rotatable, zoomable"]').count(),0,
      "Generic procedural substitute must never render");
    console.log("PASS fixture GLB interactions for "+expectedId);
  }
  for(const [index,id] of ["rotor","rover","modular","blend"].entries()){
    await enterOrb(index);
    await inspect(id);
    await detail.getByRole("button",{name:/BACK TO PATHWAYS/}).click();
    await page.getByRole("tab").first().waitFor();
    if(process.env.ASCENSION_INSPECTION_ONLY)break;
  }
  assert.deepEqual([...new Set(generated.map(x=>x.id))].sort(),process.env.ASCENSION_INSPECTION_ONLY?["rotor"]:["blend","modular","rotor","rover"],"Only selected pathways request pictures");
  assert.ok(generated.every(x=>x.view==="assembled"),
    "Blueprint and Dissect must never regenerate unrelated pictures");
  const imageCount = generated.length;
  await enterOrb(0);
  await page.locator('img[alt^="Concept picture of"]').waitFor();
  assert.equal(generated.length,imageCount,"Returning to the chosen pathway reuses its image");
  assert.equal(await detail.getByRole("textbox",{name:"Ask the Tree"}).inputValue(),"","Guide context must not appear as typed user text");
  await detail.getByRole("button",{name:/BACK TO PATHWAYS/}).click();

  await page.setViewportSize({width:390,height:844});
  await page.getByRole("region",{name:"Pathways around the Tree of Knowledge"}).screenshot({path:"C:/Users/Gordo/.codex/tmp/ascension-feedback-check/carousel-mobile.png"});
  await page.getByRole("button",{name:"Next pathway",exact:true}).click();
  await page.getByRole("tab").filter({has:page.locator('[data-active=true]')}).count();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),"Mobile carousel must not overflow horizontally");
  await page.setViewportSize({width:1100,height:800});
  await page.getByRole("button",{name:"New objective"}).click();
  await page.locator("#objective").fill("make a linear propulsion engine");
  await page.getByRole("button",{name:"ENGAGE ASCENSION"}).click();
  await page.getByRole("tab").first().waitFor();
  await enterOrb(0);
  await inspect("linear1");
  assert.equal(new Set(generated.map(x=>x.id)).size,process.env.ASCENSION_INSPECTION_ONLY?4:6,"The finished blend and each opened pathway receive pictures");
  assert.equal(errors.length,0,errors.join(" | "));
  await page.goto(new URL("/console",process.env.ASCENSION_BASE_URL||"http://127.0.0.1:4174/").href);
  await page.locator("#objective").waitFor();
  assert.equal(new URL(page.url()).pathname,"/","Old Inspect bookmarks return to public V1");
  console.log("PASS V1 browser fixture checks: entry speech callback, hidden brief, four choices, preserved picture, GLB blueprint/explode/reassemble, component descriptions and geometry controls. Not live generation or audible playback acceptance.");
  }
} finally{
  await browser.close();
}
