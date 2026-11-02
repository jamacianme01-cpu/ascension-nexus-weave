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
      cancel(){},speak(utterance){window.__treeSpeech.push(utterance.text);queueMicrotask(()=>{
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
    const linear=String(input.objective??"").includes("linear propulsion");
    let body;
    if(phase==="capability")body={picture_generation_enabled:true};
    else if(phase==="initial")body={phase:"initial",answer:"Private engineering analysis"};
    else if(phase==="picture"){
      generated.push({id:input.pathway?.id,view:input.view});
      body={image_url:"data:image/png;base64,"+mockImage,verified:false};
    }
    else if(phase==="pathways")body=linear?{
      introduction:"Design choices",
      pathways:[
        path("linear1","Three coil drive","Linear propulsion uses staged electromagnetic coils.",linearParts),
        path("linear2","Segmented translator","Linear propulsion uses a modular track.",linearParts),
        path("linear3","Rail controlled path","Linear motor with managed motion.",linearParts)
      ],
      blend:{...path("linear4","BLEND propulsion","Integrated linear motor drive.",linearParts),blend_reason:"Combined"},
      verified:false,contributors:["OpenAI"],unavailable:[],providerErrors:[],governance:"unverified"
    }:{
      introduction:"Design choices",
      pathways:[
        path("rotor","Rotorcraft Worker Drone","Four rotors carry a payload gripper.",droneParts),
        path("rover","Ground Rover Worker Drone","Ground robot drives by wheels.",droneParts),
        path("modular","Modular Worker Drone","Swappable multirotor work tool.",droneParts)
      ],
      blend:{...path("blend","BLEND modular team","Coordinated drones with interchangeable tools.",droneParts),blend_reason:"Combined"},
      verified:false,contributors:["OpenAI"],unavailable:[],providerErrors:[],governance:"unverified"
    };
    else if(phase==="guide")body={phase:"guide",answer:"Inspect the selected source geometry."};
    else body={error:"Unexpected phase "+phase};
    await route.fulfill({status:body.error?503:200,contentType:"application/json",body:JSON.stringify(body)});
  });
  const res=await page.goto(process.env.ASCENSION_BASE_URL||"http://127.0.0.1:4174/",{
    waitUntil:"domcontentloaded",
  });
  assert.equal(res?.status(),200);
  const hero=page.locator('img[src="/approved-scene/ascension-tree-behind-book-hq.jpg"]');
  await hero.waitFor();
  const entry=page.getByRole("region",{name:"Engage ASCENSION"});
  await entry.waitFor({state:"visible"});
  await page.getByRole("button",{name:"Hear the Tree",exact:true}).click();
  assert.ok(await page.evaluate(()=>window.__treeSpeech.some(s=>s.startsWith("Welcome to ASCENSION"))));
  await page.locator("#objective").fill("make worker drones");
  await page.getByRole("button",{name:"ENGAGE ASCENSION"}).click();
  await page.getByRole("tab").first().waitFor();
  assert.equal(await page.getByRole("tab").count(),4);
  assert.equal(await page.getByText("INITIAL ANSWER",{exact:true}).count(),0);
  assert.equal(await page.getByText("THREE PATHWAYS + FOURTH BLEND",{exact:true}).count(),0);
  assert.equal(await page.getByRole("region",{name:"Initial objective answer"}).count(),0);
  await entry.waitFor({state:"visible"});
  assert.equal(await page.locator('img[alt^="Concept picture of"]').count(),0,
    "No image generated on first page");

  const detail=page.locator('section[aria-label="Selected pathway design"]');
  const canvas=page.locator('canvas[aria-label^="Hunyuan3D generated mesh"]');
  const stages=["BLUEPRINT","DISSECT / EXPLODE","IMPLODE / REASSEMBLE"];
  async function inspect(expectedId){
    await detail.waitFor({state:"visible"});
    const picture=page.locator('img[alt^="Concept picture of"]');
    await picture.waitFor({state:"visible"});
    await page.getByRole("button",{name:"BLUEPRINT",exact:true}).waitFor({state:"visible"});
    await page.waitForFunction(()=>{const b=[...document.querySelectorAll("button")].find(b=>b.textContent==="BLUEPRINT");return b&&!b.disabled;});
    assert.equal(await canvas.count(),0,"GLB arrival must not replace the invention picture");
    const original=await picture.getAttribute("src");
    await page.getByRole("button",{name:"BLUEPRINT",exact:true}).click();
    await canvas.waitFor({state:"visible",timeout:16000});
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
    await page.getByRole("button",{name:"ASSEMBLED",exact:true}).click();
    await page.waitForTimeout(200);
    const assembledPixels=await canvas.screenshot();
    await page.getByRole("button",{name:"DISSECT / EXPLODE",exact:true}).click();
    await page.locator('[aria-label="One real Hunyuan3D model"][data-mode="dissect"]').waitFor();
    assert.equal(await canvas.evaluate(el=>el===window.__realMesh),true,
      "Dissect must reuse the actual Hunyuan GLB canvas");
    await page.waitForTimeout(200);
    assert.notDeepEqual(await canvas.screenshot(),assembledPixels,"Explosion must actually separate geometry");
    await page.getByRole("button",{name:"IMPLODE / REASSEMBLE",exact:true}).click();
    await page.locator('[aria-label="One real Hunyuan3D model"][data-mode="assembled"]').waitFor();
    assert.equal(await canvas.evaluate(el=>el===window.__realMesh),true,
      "Reassemble must not regenerate another design");
    await page.waitForTimeout(200);
    assert.deepEqual(await canvas.screenshot(),assembledPixels,"Implosion must restore the original assembly");
    await page.getByRole("button",{name:"LABELS",exact:true}).click();
    await page.getByRole("button",{name:/^(Rotor|Coil)$/,exact:true}).click();
    await page.getByText(/What it does:/).waitFor({state:"visible"});
    await page.getByText("Inspect model geometry",{exact:true}).click();
    await page.getByRole("button",{name:"Hunyuan rotor mesh"}).click();
    await page.getByRole("button",{name:"MOVE RIGHT"}).click();
    await page.getByRole("button",{name:"ZOOM IN"}).click();
    await page.getByRole("button",{name:"DIVE INTO REALITY"}).click();
    await page.getByRole("button",{name:"CLOSE REALITY VIEW"}).click();
    assert.equal(await detail.count(),1);
    await page.getByRole("button",{name:"INVENTION PICTURE",exact:true}).click();
    await picture.waitFor({state:"visible"});
    assert.equal(await picture.getAttribute("src"),original,"Picture identity survives all model views");
    assert.equal(await detail.getByText("Hunyuan3D mesh ready").count(),0);
    assert.equal(await page.locator('canvas[aria-label^="Rotatable, zoomable"]').count(),0,
      "Generic procedural substitute must never render");
    console.log("PASS fixture GLB interactions for "+expectedId);
  }
  for(const [index,id] of ["rotor","rover","modular","blend"].entries()){
    await page.getByRole("tab").nth(index).click();
    await inspect(id);
    await detail.getByRole("button",{name:/BACK TO PATHWAYS/}).click();
    await page.getByRole("tab").first().waitFor();
  }
  assert.deepEqual(generated.map(x=>x.id),["rotor","rover","modular","blend"]);
  assert.ok(generated.every(x=>x.view==="assembled"),
    "Blueprint and Dissect must never regenerate unrelated pictures");

  await page.getByRole("button",{name:"New objective"}).click();
  await page.locator("#objective").fill("make a linear propulsion engine");
  await page.getByRole("button",{name:"ENGAGE ASCENSION"}).click();
  await page.getByRole("tab").first().waitFor();
  await page.getByRole("tab").first().click();
  await inspect("linear1");
  assert.equal(generated.length,5,"Only selected pathways generate Hunyuan input images");
  assert.equal(errors.length,0,errors.join(" | "));
  console.log("PASS V1 browser fixture checks: entry speech callback, hidden brief, four choices, preserved picture, GLB blueprint/explode/reassemble, component descriptions and geometry controls. Not live generation or audible playback acceptance.");
} finally{
  await browser.close();
}
