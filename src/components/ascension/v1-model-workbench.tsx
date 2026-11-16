import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export type V1PhysicalMode = "assembled" | "blueprint" | "dissect";
export type V1Component = { name: string; position: [number,number,number]; role: string };

/** Identify only objects for which ASCENSION has a coherent, editable conceptual assembly.
 * Do NOT substitute an arbitrary motor or disconnected spheres for unknown inventions.
 */
export function v1AssemblyKind(objective: string, title: string, summary: string) {
  const combined = (objective + " " + title + " " + summary).toLowerCase();
  const specific = (title + " " + summary).toLowerCase();
  if (/linear (?:propulsion|motor|engine|thrust)|linear (?:translator|actuator)|maglev|electromagnetic rail/.test(combined))
    return "linear" as const;
  if (/\b(rover|ground robot|wheeled|ground-based|wheel-driven)\b/.test(specific) && /\b(drone|robot|worker)\b/.test(combined))
    return "rover" as const;
  if (/\b(drone|quadcopter|multirotor|rotorcraft|uav|flying robot)\b/.test(combined))
    return "multirotor" as const;
  return null;
}
type Kind = NonNullable<ReturnType<typeof v1AssemblyKind>>;
type Part = { node: THREE.Group; name: string; role: string; home: THREE.Vector3; original: THREE.Vector3 };
type Assembly = { root: THREE.Group; parts: Part[] };
const steel = 0x6c8fa4, cyan = 0x52dce9, gold = 0xe5b458, dark = 0x202e3b, copper = 0xbe714b;

function build(kind: Kind, title: string): Assembly {
  const pathwayIdentity=title.toLowerCase();
  const root = new THREE.Group();
  const parts: Part[] = [];
  const material = (color: number) => new THREE.MeshStandardMaterial({
    color, metalness: 0.55, roughness: 0.32,
  });
  function add(name: string, role: string, pos: [number,number,number]) {
    const node = new THREE.Group();
    node.name = name;
    node.position.set(...pos);
    root.add(node);
    parts.push({node,name,role,home:node.position.clone(),original:node.position.clone()});
    return node;
  }
  function mesh(node: THREE.Group, geometry: THREE.BufferGeometry, color: number, offset: [number,number,number]=[0,0,0]) {
    const item = new THREE.Mesh(geometry,material(color));
    item.position.set(...offset);
    (item.material as THREE.MeshStandardMaterial).userData["naturalColor"] = color;
    item.castShadow = true;
    item.receiveShadow = true;
    node.add(item);
    return item;
  }
  const box = (node: THREE.Group, size: [number,number,number], color: number, offset?: [number,number,number]) =>
    mesh(node,new THREE.BoxGeometry(...size),color,offset);
  const cylinder = (node: THREE.Group, radius: number, length: number, color: number, offset?: [number,number,number]) =>
    mesh(node,new THREE.CylinderGeometry(radius,radius,length,28),color,offset);
  if (kind === "linear") {
    // Relative proportions are a concept scaffold, not certified measurements.
    const base = add("Structural base", "Holds the stator and guide-rail anchors", [0,-0.72,0]);
    box(base,[5.6,0.16,1.35],dark);
    for (const z of [-0.44,0,0.44]) {
      const rail=add("Guide rail "+(z===-0.44?1:z===0?2:3),"Constrains the carriage to a linear path",[0,0,z]);
      box(rail,[5.9,0.12,0.14],cyan,[0,0.12,0]);
    }
    for(const x of [-1.45,0,1.45]) {
      const station=add("Coil station "+(x===-1.45?1:x===0?2:3),"Electromagnetic drive stage",[x,0.42,0]);
      const outer=mesh(station,new THREE.TorusGeometry(0.62,0.14,14,50),gold);
      outer.rotation.y=Math.PI/2;
      for(let i=-2;i<=2;i++) {
        const winding=mesh(station,new THREE.TorusGeometry(0.46,0.025,10,40),copper,[i*0.065,0,0]);
        winding.rotation.y=Math.PI/2;
      }
      box(station,[0.25,1.48,1.48],steel,[0,0,0]).material = new THREE.MeshStandardMaterial({color:steel,transparent:true,opacity:0.13,metalness:0.2});
    }
    const carriage=add("Translator carriage","Moves along the rails; position shown is illustrative",[0,0.15,0]);
    box(carriage,[0.92,0.32,0.73],gold);
    box(carriage,[0.45,0.21,0.4],dark,[0,0.25,0]);
    const spine=add("Motor stator spine","Maintains alignment of the electromagnetic stations",[0,0.1,0]);
    box(spine,[4.6,0.13,0.16],dark,[0,0,0.05]);
  } else if (kind === "multirotor") {
    const fuselage=add("Central airframe","Supports avionics, battery, and four rotor arms",[0,0.28,0]);
    box(fuselage,[1.45,0.45,1.08],dark);
    mesh(fuselage,new THREE.SphereGeometry(0.36,18,12),steel,[0,0.31,0]);
    const battery=add("Battery module","Provides electrical power",[0,-0.04,0]);
    box(battery,[0.82,0.27,0.62],copper);
    const flight=add("Flight controller and sensors","Provides stabilization and navigation",[0,0.56,0]);
    box(flight,[0.52,0.16,0.43],cyan);
    for(const [i,x,z] of [[1,-1.55,-1.28],[2,-1.55,1.28],[3,1.55,-1.28],[4,1.55,1.28]] as [number,number,number][]) {
      const arm=add("Rotor arm "+i,"Supports an independently driven lift rotor",[x/2,0.3,z/2]);
      const limb=box(arm,[Math.hypot(x,z)+0.2,0.13,0.16],steel);
      limb.rotation.y=-Math.atan2(z,x);
      const rotor=add("Rotor "+i,"Generates lift and control torque",[x,0.32,z]);
      cylinder(rotor,0.22,0.26,dark);
      for(let blade=0;blade<2;blade++){
        const b=box(rotor,[1.05,0.025,0.14],cyan,[0,0.2,0]);
        b.rotation.y=blade*Math.PI/2;
      }
      const rim=mesh(rotor,new THREE.TorusGeometry(0.67,0.025,8,45),steel,[0,0.2,0]);
      rim.rotation.x=Math.PI/2;
    }
    const tool=add("Work tool / gripper","Represents the pathway's carried working tool",[0,-0.54,0]);
    cylinder(tool,0.15,0.45,steel);
    for(const x of [-0.2,0.2])box(tool,[0.1,0.38,0.11],gold,[x,-0.35,0]);
    for(const x of [-0.56,0.56]){
      const leg=add("Landing support "+(x<0?"left":"right"),"Supports the drone on the ground",[x,-0.4,0]);
      box(leg,[0.06,0.7,0.09],steel);
      box(leg,[0.18,0.08,1.15],steel,[0,-0.35,0]);
    }
  } else {
    const chassis=add("Rover chassis","Supports the onboard power and work system",[0,0.3,0]);
    box(chassis,[2.8,0.42,1.55],dark);
    box(chassis,[1.9,0.2,1.12],steel,[0,0.3,0]);
    for(const [i,x,z] of [[1,-1.03,-0.92],[2,-1.03,0.92],[3,1.03,-0.92],[4,1.03,0.92]] as [number,number,number][]) {
      const wheel=add("Driven wheel "+i,"Provides traction and steering support",[x,-0.1,z]);
      const w=cylinder(wheel,0.43,0.29,dark);
      w.rotation.x=Math.PI/2;
      const hub=cylinder(wheel,0.17,0.31,gold);
      hub.rotation.x=Math.PI/2;
    }
    const power=add("Battery and power unit","Supplies the drive and tools",[0,0.69,-0.22]);
    box(power,[0.95,0.28,0.65],copper);
    const sensor=add("Navigation sensor mast","Provides range and obstacle observations",[0.42,1.03,0.1]);
    cylinder(sensor,0.065,1.0,steel);
    cylinder(sensor,0.32,0.16,cyan,[0,0.54,0]);
    const tool=add("Modular work tool","Carries the selected pathway's physical working attachment",[-1.56,0.35,0]);
    box(tool,[0.86,0.2,0.44],gold);
    const gripper=add("Front tool gripper","Grips or transfers light materials",[-2.08,0.34,0]);
    for(const z of [-0.18,0.18])box(gripper,[0.42,0.17,0.09],steel,[0,0,z]);
  }
  // Named pathway architecture variants are built once, then reused across views.
  if(kind==="multirotor") {
    if(/modular|platform|interchangeable/.test(pathwayIdentity)) {
      const dock=add("Modular payload docking rail","Provides a swappable attachment interface",[0,-0.85,0]);
      box(dock,[1.35,0.12,0.27],gold);
      for(const z of [-0.58,0.58]) {
        const latch=add("Tool-module latch "+(z<0?"left":"right"),"Secures interchangeable attachments",[0,-0.66,z]);
        box(latch,[0.46,0.16,0.15],cyan);
      }
    }
    if(/team|coordinat|swarm|collaborat|adaptive|blend|fleet/.test(pathwayIdentity)) {
      const transceiver=add("Team coordination antenna","Exchanges cooperative positioning and task messages",[0,0.88,0.04]);
      cylinder(transceiver,0.055,0.65,steel);
      mesh(transceiver,new THREE.SphereGeometry(0.15,18,14),cyan,[0,0.38,0]);
      for(const [i,x] of [[1,-0.62],[2,0.62]] as [number,number][]) {
        const sensor=add("Coordination sensor pod "+i,"Provides additional local scene observations",[x,0.42,-0.48]);
        box(sensor,[0.25,0.19,0.30],gold);
      }
    }
  }
  if(kind==="linear" && /modular|segment|distributed/.test(pathwayIdentity)){
    for(const x of [-2.3,2.3]) {
      const connector=add("Modular track coupler "+(x<0?"left":"right"),"Connects repeatable propulsion track sections",[x,0.14,0]);
      box(connector,[0.22,0.32,1.12],gold);
    }
  }
  return {root,parts};
}
type Props = {
  kind: Kind; mode: V1PhysicalMode; title: string; selected?: string | null;
  zoom: number; rotation: number; reset: number;
  onParts: (parts: V1Component[]) => void; onSelect: (name: string) => void;
  onError: (reason: string) => void;
  edit?: {id:number;name:string;action:"left"|"right"|"up"|"down"|"hide"|"restore"};
};
/** One immutable assembly identity, three camera/transform views. No picture regeneration. */
export function V1ModelWorkbench({kind,mode,title,selected,zoom,rotation,reset,onParts,onSelect,onError,edit}:Props) {
  const host=useRef<HTMLDivElement>(null);
  const state=useRef<{
    renderer:THREE.WebGLRenderer; scene:THREE.Scene; perspective:THREE.PerspectiveCamera;
    orthographic:THREE.OrthographicCamera; front:THREE.OrthographicCamera; side:THREE.OrthographicCamera;
    controls:OrbitControls; assembly:Assembly;
    raf:number; observer:ResizeObserver; pick:(event:PointerEvent)=>void;
  }|null>(null);
  const onSelectRef=useRef(onSelect);
  onSelectRef.current=onSelect;
  const [missingWebgl,setMissingWebgl]=useState(false);
  useEffect(()=>{
    const container=host.current;
    if(!container)return;
    let renderer:THREE.WebGLRenderer;
    try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:"default"});}
    catch{setMissingWebgl(true);onError("3D acceleration is unavailable in this browser.");return;}
    const scene=new THREE.Scene();
    const assembledBackground=new THREE.Color("#071521");
    const blueprintBackground=new THREE.Color("#041d32");
    scene.background=assembledBackground;
    const assembly=build(kind,title);
    scene.add(assembly.root);
    scene.add(new THREE.HemisphereLight(0xe6f9ff,0x2a4150,2.1));
    const light=new THREE.DirectionalLight(0xffffff,2.6);
    light.position.set(6,9,7);scene.add(light);
    const grid=new THREE.GridHelper(12,24,0x376e88,0x1c3649);
    (grid.material as THREE.LineBasicMaterial).transparent=true;
    grid.position.y=-1.25;scene.add(grid);
    const perspective=new THREE.PerspectiveCamera(38,1,0.1,120);
    perspective.position.set(4,3.3,5.5);
    perspective.lookAt(0,0,0);
    const orthographic=new THREE.OrthographicCamera(-5,5,5,-5,0.1,120);
    orthographic.position.set(0,12,0.01);
    orthographic.up.set(0,0,-1);
    orthographic.lookAt(0,0,0);
    const front=orthographic.clone();
    front.up.set(0,1,0);
    front.position.set(0,2.0,12);
    front.lookAt(0,0,0);
    const side=orthographic.clone();
    side.up.set(0,1,0);
    side.position.set(12,2.0,0);
    side.lookAt(0,0,0);
    const controls=new OrbitControls(perspective,renderer.domElement);
    controls.enableDamping=true;
    controls.dampingFactor=0.08;
    controls.minDistance=2.8;
    controls.maxDistance=28;
    controls.target.set(0,0,0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
    renderer.setSize(Math.max(container.clientWidth,300),Math.max(container.clientHeight,340));
    renderer.domElement.style.width="100%";
    renderer.domElement.style.height="100%";
    renderer.domElement.style.display="block";
    renderer.domElement.style.touchAction="none";
    renderer.domElement.setAttribute("aria-label","Rotatable, zoomable, component-selectable conceptual 3D model of "+title);
    container.appendChild(renderer.domElement);
    const raycaster=new THREE.Raycaster();
    const pointer=new THREE.Vector2();
    const pick=(event:PointerEvent)=>{
      const rect=renderer.domElement.getBoundingClientRect();
      const blueprint=container.dataset.mode==="blueprint";
      const screenX=(event.clientX-rect.left)/rect.width;
      const slot=Math.min(2,Math.max(0,Math.floor(screenX*3)));
      const relativeX=blueprint?screenX*3-slot:screenX;
      pointer.set(2*relativeX-1,1-2*(event.clientY-rect.top)/rect.height);
      raycaster.setFromCamera(pointer,blueprint?[orthographic,front,side][slot]!:perspective);
      const objects=raycaster.intersectObjects(assembly.root.children,true);
      const match=objects[0]?.object;
      if(!match)return;
      let current:THREE.Object3D|null=match;
      while(current && current.parent!==assembly.root) current=current.parent;
      if(current?.name)onSelectRef.current(current.name);
    };
    let down: {x:number;y:number}|null=null;
    const pointerDown=(e:PointerEvent)=>{down={x:e.clientX,y:e.clientY};};
    const pointerUp=(e:PointerEvent)=>{if(down&&Math.hypot(e.clientX-down.x,e.clientY-down.y)<5)pick(e);down=null;};
    renderer.domElement.addEventListener("pointerdown",pointerDown);
    renderer.domElement.addEventListener("pointerup",pointerUp);
    const observer=new ResizeObserver(()=>{
      if(!container.isConnected)return;
      const width=Math.max(container.clientWidth,300),height=Math.max(container.clientHeight,300);
      perspective.aspect=width/height;
      perspective.updateProjectionMatrix();
      const range=5.2,aspect=(width/3)/height;
      for(const camera of [orthographic,front,side]){
        camera.left=-range*aspect;
        camera.right=range*aspect;
        camera.top=range;
        camera.bottom=-range;
        camera.updateProjectionMatrix();
      }
      renderer.setSize(width,height,false);
    });
    observer.observe(container);
    let raf=0;
    let lastFrame=0;
    const animate=(time:number)=>{
      raf=requestAnimationFrame(animate);
      const blueprint=container.dataset.mode==="blueprint";
      if(time-lastFrame<(blueprint?70:42))return;
      lastFrame=time;
      grid.visible=true;
      (grid.material as THREE.LineBasicMaterial).opacity=blueprint?.2:.09;
      scene.background=blueprint?blueprintBackground:assembledBackground;
      controls.enabled=!blueprint;
      controls.update();
      if(blueprint){
        const width=Math.max(container.clientWidth,300),height=Math.max(container.clientHeight,300);
        const cameras=[orthographic,front,side];
        const column=width/3;
        renderer.setScissorTest(true);
        cameras.forEach((camera,i)=>{
          const x=Math.round(i*column);
          const w=Math.round((i+1)*column)-x;
          renderer.setViewport(x,0,w,height);
          renderer.setScissor(x,0,w,height);
          renderer.render(scene,camera);
        });
        renderer.setScissorTest(false);
        renderer.setViewport(0,0,width,height);
      }else{
        renderer.render(scene,perspective);
      }
    };
    animate();
    state.current={renderer,scene,perspective,orthographic,front,side,controls,assembly,raf,observer,pick};
    onParts(assembly.parts.map(p=>({name:p.name,position:[p.home.x,p.home.y,p.home.z],role:p.role})));
    return ()=>{
      cancelAnimationFrame(raf);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown",pointerDown);
      renderer.domElement.removeEventListener("pointerup",pointerUp);
      controls.dispose();
      scene.traverse(o=>{if(o instanceof THREE.Mesh){
        o.geometry.dispose();
        const m=o.material;
        if(Array.isArray(m))m.forEach(x=>x.dispose());else m.dispose();
      }});
      renderer.dispose();
      renderer.domElement.remove();
      state.current=null;
    };
  },[kind,title]);

  useEffect(()=>{
    if(host.current)host.current.dataset.mode=mode;
    const st=state.current;if(!st)return;
    const blueprint=mode==="blueprint",exploded=mode==="dissect";
    st.assembly.parts.forEach((part,index)=>{
      const home=part.home;
      if(exploded) {
        const outward=new THREE.Vector3(home.x,0,home.z);
        if(outward.lengthSq()<0.05) outward.set(index%2?1:-1,0,index%3-1);
        outward.normalize().multiplyScalar(0.7);
        part.node.position.copy(home).add(outward);
        part.node.position.y+=((index%6)-2.5)*0.42;
      } else part.node.position.copy(home);
      part.node.traverse(item=>{if(item instanceof THREE.Mesh){
        const mat=item.material as THREE.MeshStandardMaterial;
        mat.wireframe=blueprint;
        mat.color.setHex(blueprint?0x69dfe7:Number(mat.userData["naturalColor"]??steel));
      }});
    });
    st.controls.reset();
    if(blueprint){
      st.orthographic.position.set(0,12,0.01);
      st.orthographic.lookAt(0,0,0);
    }
  },[mode,kind]);
  useEffect(()=>{
    const st=state.current;if(!st)return;
    const baseDistance=kind==="linear"?7.5:kind==="rover"?6.8:6.2;
    st.perspective.position.setLength(Math.max(3,Math.min(25,baseDistance/zoom)));
    st.perspective.updateProjectionMatrix();
    for(const camera of [st.orthographic,st.front,st.side]){
      camera.zoom=zoom;
      camera.updateProjectionMatrix();
    }
  },[zoom]);
  useEffect(()=>{const st=state.current;if(st)st.assembly.root.rotation.y=rotation*Math.PI/180;},[rotation]);
  useEffect(()=>{
    const st=state.current;if(!st)return;
    st.assembly.parts.forEach(p=>{
      p.home.copy(p.original);
      p.node.position.copy(p.home);
      p.node.visible=true;
    });
    st.assembly.root.rotation.set(0,0,0);
  },[reset]); 
  useEffect(()=>{
    const st=state.current;
    if(!st||!edit)return;
    const p=st.assembly.parts.find(x=>x.name===edit.name);
    if(!p)return;
    if(edit.action==="hide"){p.node.visible=false;return;}
    if(edit.action==="restore"){p.node.visible=true;return;}
    const axis=edit.action==="left"||edit.action==="right"?"x":"y";
    p.home[axis]+=(edit.action==="left"||edit.action==="down"?-0.16:0.16);
    p.node.position.copy(p.home);
    if(mode==="dissect"){
      const index=st.assembly.parts.indexOf(p);
      const outward=new THREE.Vector3(p.home.x,0,p.home.z);
      if(outward.lengthSq()<0.05)outward.set(index%2?1:-1,0,index%3-1);
      outward.normalize().multiplyScalar(0.7);
      p.node.position.add(outward);
      p.node.position.y+=((index%6)-2.5)*0.42;
    }
  },[edit?.id]);
  useEffect(()=>{
    const st=state.current;if(!st)return;
    st.assembly.parts.forEach(p=>p.node.traverse(item=>{
      if(item instanceof THREE.Mesh){
        const m=item.material as THREE.MeshStandardMaterial;
        m.emissive.setHex(selected===p.name?0x174f56:0);
      }
    }));
  },[selected,kind]);
  return <div ref={host} data-mode={mode}
    className="h-full min-h-[390px] w-full overflow-hidden rounded-lg"
    aria-label="Canonical 3D invention assembly">
    {missingWebgl && <p role="alert" className="p-6 text-center">3D graphics are unavailable in this browser.</p>}
  </div>;
}
