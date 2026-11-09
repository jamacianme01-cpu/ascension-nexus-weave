import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const ui=read("src/components/ascension/independent-engage.tsx");
const design=read("src/components/ascension/v1-hunyuan-pathway.tsx");
const glb=read("src/components/ascension/v1-hunyuan-workbench.tsx");
const bridge=read("runtime_bridge/hunyuan_browser_bridge.py");
const launcher=read("runtime_bridge/start_hunyuan_now.ps1");
const route=read("src/routes/api/public/ascension/independent.ts");
const app=read("src/routes/index.tsx");
const guide=read("src/components/ascension/tree-guide.tsx");
const styles=read("src/book-entry.css");
const checklist=read("docs/ASCENSION_V1_OWNER_APPROVAL_CHECKLIST.md");
const tests=[
  ["original approved Tree and Book entry survives pathway work",()=>{
    assert.match(ui,/ascension-tree-behind-book-hq\.jpg/);
    assert.match(ui,/className="ascension-scene-hero"/);
    assert.match(ui,/!enteredTree && <section aria-label="ASCENSION Book entrance"/);
    assert.match(ui,/BOOK_SCENE = "\/approved-scene\/01-closed-book\.jpg"/);
    assert.match(ui,/enteredTree && choice === null && !result && <section aria-label="ASCENSION Tree world"/);
    assert.match(ui,/onClick=\{\(\) => enterCategory\(item.id\)\}/);
    assert.match(ui,/className="ascension-entry-guide"/);
    assert.doesNotMatch(ui,/onClick=\{\(\) => setSection\(item.id\)\}/);
    assert.match(ui,/data-realities=\{choice !== null \? "true" : undefined\}/);
    assert.match(ui,/What do you want to accomplish\?/);
    assert.match(ui,/ENGAGE ASCENSION/);
    assert.match(app,/IndependentEngage/);
    assert.doesNotMatch(ui,/ascension-arrival-message/);
  }],
  ["home is not redesigned or replaced when pathways appear",()=>{
    assert.match(ui,/\{result && choice === null && <section/);
    assert.match(ui,/\{selected && <section ref=\{designView\}/);
    assert.match(ui,/\[\.\.\.result\.pathways, result\.blend\]/);
    assert.match(ui,/setChoice\(orbPreview\)/);
    assert.match(ui,/<TreePathwayCarousel/);
    assert.doesNotMatch(ui,/aria-label="Initial objective answer"/);
    assert.doesNotMatch(ui,/>INITIAL ANSWER</);
  }],
  ["only Hunyuan GLB is mounted on selected V1 path",()=>{
    assert.match(ui,/return <V1HunyuanPathway/);
    assert.match(ui,/modelCache=\{modelCache\}/);
    assert.doesNotMatch(ui,/<RealityViewer/);
    assert.doesNotMatch(ui,/ImagePathwayView/);
    assert.doesNotMatch(ui,/<V1ModeledPathway/);
    assert.match(design,/Hunyuan3D is creating one real 3D GLB/);
    assert.match(design,/sourceImage\.match\(validImage\)/);
    assert.match(design,/imageCache\.current\.set\(key,sourceImage\)/);
    assert.match(design,/const cachedPicture = imageCache\.current\.get\(key\)/);
    assert.match(design,/if \(designPictureReady\(cachedPicture\)\) onPicture\?\.\(true\)/);
    assert.match(design,/picture\?<div/);
    assert.match(design,/How this design works/);
    assert.match(design,/asCompletedDesignStep/);
    assert.match(route,/freePictureEnabled/);
    assert.match(route,/fetchFreeImage/);
    assert.match(design,/loadPathwayVisual\(objective,path,imageCache\.current,controller\.signal\)/);
    assert.match(design,/const generated=await fetch\(LOCAL\+"\/generate"/);
    assert.match(design,/modelCache\.current\.set\(key,output\)/);
  }],
  ["blueprint dissection and reassemble use one parsed real GLB",()=>{
    assert.match(glb,/new GLTFLoader\(\)/);
    assert.match(glb,/loader\.parse\(bytes\.slice\(0\)/);
    assert.match(glb,/type MeshRecord/);
    assert.match(glb,/explode=mode==="dissect" && st\.meshes\.length>1/);
    assert.match(design,/DISSECT \/ EXPLODE/);
    assert.match(design,/IMPLODE \/ REASSEMBLE/);
    assert.doesNotMatch(design,/DIVE INTO REALITY/);
    assert.match(glb,/orthos\.forEach/);
    assert.doesNotMatch(design,/new V1ModelWorkbench/);
    assert.match(design,/generator returned a fused mesh/);
  }],
  ["local Hunyuan bridge is restricted and never pretends Railway is localhost",()=>{
    assert.match(bridge,/HOST = "127\.0\.0\.1"/);
    assert.match(bridge,/PORT = 8082/);
    assert.match(bridge,/127\.0\.0\.1:8081\/generate/);
    assert.match(bridge,/ALLOWED_ORIGINS/);
    assert.match(bridge,/Access-Control-Allow-Private-Network/);
    assert.match(bridge,/glb\[:4\] != b"glTF"/);
    assert.match(launcher,/hunyuan_browser_bridge\.py/);
    assert.doesNotMatch(launcher,/Worker cannot claim jobs.'\n\}/);
  }],
  ["route counts only objective creation as objective, not 3D views",()=>{
    assert.match(route,/objective-global/);
    assert.match(route,/pathway-global/);
    assert.match(route,/guide-ip/);
    assert.match(route,/image-ip/);
    assert.doesNotMatch(route,/limit\("global", 48\)/);
    assert.match(route,/revisionDirective\(objective, section\)/);
    assert.match(route,/assessImageBytes/);
    assert.match(route,/!assessment\.ok/);
  }],
  ["Tree can speak and user can select actual submeshes",()=>{
    assert.match(design,/<TreeGuide objective=\{objective\}/);
    assert.match(design,/className="ascension-tree-in-pathway"/);
    assert.match(design,/introduce portrait pathway=\{path\}/);
    assert.match(styles,/\.ascension-knowledgeverse \.ascension-pathway-side/);
    assert.match(styles,/max-height: calc\(100svh - 1\.3rem\)/);
    assert.match(ui,/introduce portrait enabled=\{props.speakingEnabled\}/);
    assert.doesNotMatch(guide,/What is my first practical step\?/);
    assert.doesNotMatch(guide,/Let.s work on it together/);
    assert.match(guide,/ascension-tree-character/);
    assert.match(ui,/firstAnswer: continuationContext.current/);
    assert.match(ui,/ascension-business-plan-flow/);
    assert.match(guide,/webkitSpeechRecognition/);
    assert.match(guide,/phase: "guide"/);
    assert.match(design,/inspect\(p\.meshIndex\)/);
    assert.match(design,/onClick=\{\(\)=>moveMesh\(delta\)\}/);
    assert.match(design,/Geometry names are not verified component identities/);
  }],
  ["owner approval remains pending",()=>{
    assert.ok(checklist.includes("- [ ]"));
    assert.ok(!checklist.includes("- [x]"));
  }]
];
for(const [name,test] of tests){
  test();
  console.log("PASS V1 "+name);
}
console.log("Verified "+tests.length+" static repair contracts; live Hunyuan requires the owner's GPU process.");
