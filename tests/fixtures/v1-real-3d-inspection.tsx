import React, { useEffect, useState } from "react";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { createRoot } from "react-dom/client";
import {
  V1DesignViewport, type DesignView,
} from "../../src/components/ascension/v1-design-viewport";

function Fixture() {
  const [asset,setAsset]=useState<string | null>(null);
  const [mode,setMode]=useState<DesignView>("assembled");
  const [rotation,setRotation]=useState(0);
  const [zoom,setZoom]=useState(0);
  const [error,setError]=useState("");
  useEffect(()=>{
    let active=true;
    let uri:string | null=null;
    const create = async () => {
      const root=new THREE.Group();
      const rotated=new THREE.Group();
      rotated.position.set(1.5,0.25,0);
      rotated.rotation.y=0.65;
      rotated.scale.set(1.6,1.05,0.7);
      root.add(rotated);
      const a=new THREE.Mesh(
        new THREE.BoxGeometry(1,1.25,0.75),
        new THREE.MeshStandardMaterial({color:0x4488bb}));
      const b=new THREE.Mesh(
        new THREE.BoxGeometry(0.6,0.9,1.1),
        new THREE.MeshStandardMaterial({color:0xc5a873}));
      a.position.set(-0.9,0,0);
      b.position.set(0.9,0,0);
      rotated.add(a,b);
      const exported=await new GLTFExporter().parseAsync(root,{binary:true});
      if(!(exported instanceof ArrayBuffer)) throw Error("Synthetic test GLB export failed");
      uri=URL.createObjectURL(new Blob([exported],{type:"model/gltf-binary"}));
      if(active) setAsset(uri);
      else URL.revokeObjectURL(uri);
    };
    void create().catch(cause => {if(active) setError(String(cause));});
    return ()=>{active=false;if(uri)URL.revokeObjectURL(uri);};
  },[]);
  return <main>
    <div aria-label="Disposable fixture controls" style={{display:"flex",gap:8,margin:8}}>
      {(["assembled","blueprint","dissect","exploded","imploded"] as DesignView[]).map(item=>
        <button type="button" key={item} onClick={()=>setMode(item)}>{item}</button>)}
      <button type="button" onClick={()=>setRotation(v=>v+1)}>Rotate delivered model</button>
      <button type="button" onClick={()=>setZoom(v=>v+1)}>Zoom delivered model</button>
      <button type="button" onClick={()=>setAsset(null)}>Remove test GLB</button>
    </div>
    <output id="test-mode">{mode}</output>
    <output id="test-export-error">{error}</output>
    <div style={{position:"relative",height:"min(75vh,600px)",width:"min(90vw,900px)",border:"1px solid #eee"}}>
      <V1DesignViewport modelUrl={asset}
        imageUrl={"data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2040%2040'%3E%3Crect%20width='40'%20height='40'%20fill='%235599bb'/%3E%3C/svg%3E"}
        blueprintUrl={null} mode={mode} rotateRequest={rotation} zoomRequest={zoom}/>
    </div>
  </main>;
}
createRoot(document.getElementById("root")!).render(<Fixture/>);
