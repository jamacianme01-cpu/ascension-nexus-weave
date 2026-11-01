import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export type HunyuanMode = "assembled" | "blueprint" | "dissect";
export type MeshPart = { name: string; meshIndex: number };
type Props = {
  bytes: ArrayBuffer;
  title: string;
  mode: HunyuanMode;
  zoom: number;
  rotation: number;
  selected: number | null;
  move?: { seq: number; index: number; delta: [number,number,number] };
  reset: number;
  onParts: (parts: MeshPart[]) => void;
  onError: (message: string) => void;
  onSelect: (index: number) => void;
};
type MeshRecord = {
  mesh: THREE.Mesh;
  originalPosition: THREE.Vector3;
  originalMaterials: THREE.Material | THREE.Material[];
  blueprintMaterials: THREE.Material | THREE.Material[];
};
type Runtime = {
  scene: THREE.Scene; root: THREE.Group; renderer: THREE.WebGLRenderer;
  controls: OrbitControls; camera: THREE.PerspectiveCamera;
  orthos: THREE.OrthographicCamera[]; meshes: MeshRecord[];
  observer: ResizeObserver; frame: number;
};

/** Renders the actual GLB bytes returned by the owner's Hunyuan3D local runtime.
 * Every tab transforms ONE parsed scene; no replacement images or invented objects.
 * Hunyuan may return a single fused mesh. We do not mislabel fake sub-components.
 */
export function V1HunyuanWorkbench({
  bytes,title,mode,zoom,rotation,selected,move,reset,onParts,onError,onSelect,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const live = useRef<Runtime|null>(null);
  const latestSelect = useRef(onSelect);
  latestSelect.current=onSelect;
  const [loading,setLoading]=useState(true);
  const [revision,setRevision]=useState(0);
  const [error,setError]=useState("");
  useEffect(()=>{
    const node=host.current;
    if(!node)return;
    let closed=false;
    let renderer:THREE.WebGLRenderer;
    try { renderer=new THREE.WebGLRenderer({antialias:true,alpha:false}); }
    catch {setError("WebGL is unavailable in this browser");onError("WebGL is unavailable");return;}
    const scene=new THREE.Scene();
    scene.background=new THREE.Color("#051727");
    scene.add(new THREE.HemisphereLight(0xdff4ff,0x39556f,2.2));
    const light=new THREE.DirectionalLight(0xffffff,2.0);
    light.position.set(4,7,8);scene.add(light);
    const root=new THREE.Group();
    scene.add(root);
    const camera=new THREE.PerspectiveCamera(42,1,0.01,150);
    camera.position.set(5,4,7);
    const orthos = [new THREE.OrthographicCamera(),new THREE.OrthographicCamera(),new THREE.OrthographicCamera()];
    const axes: Array<{pos:[number,number,number];up:[number,number,number]}>=[
      {pos:[0,10,0.01],up:[0,0,-1]},
      {pos:[0,0,10],up:[0,1,0]},
      {pos:[10,0,0],up:[0,1,0]},
    ];
    orthos.forEach((c,i)=>{
      c.near=.01;c.far=150;
      c.position.set(...axes[i]!.pos);c.up.set(...axes[i]!.up);c.lookAt(0,0,0);
    });
    const controls=new OrbitControls(camera,renderer.domElement);
    controls.enableDamping=true;
    controls.minDistance=1.7;
    controls.maxDistance=70;
    controls.target.set(0,0,0);
    renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));
    node.appendChild(renderer.domElement);
    renderer.domElement.style.display="block";
    renderer.domElement.style.width="100%";
    renderer.domElement.style.height="100%";
    renderer.domElement.style.touchAction="none";
    renderer.domElement.setAttribute("aria-label","Hunyuan3D generated mesh of "+title);
    const runtime:Runtime={scene,root,renderer,controls,camera,orthos,meshes:[],observer:null as unknown as ResizeObserver,frame:0};
    live.current=runtime;
    const measure=()=>{
      const width=Math.max(node.clientWidth,280),height=Math.max(node.clientHeight,280);
      camera.aspect=width/height;camera.updateProjectionMatrix();
      const frameWidth=(width/3)/height;
      for(const o of orthos){
        const extent=3.25;
        o.left=-extent*frameWidth;o.right=extent*frameWidth;o.top=extent;o.bottom=-extent;
        o.updateProjectionMatrix();
      }
      renderer.setSize(width,height,false);
    };
    const observer=new ResizeObserver(measure);
    runtime.observer=observer;observer.observe(node);measure();
    const raycaster=new THREE.Raycaster();
    const pointer=new THREE.Vector2();
    let pointerStart: [number,number]|null=null;
    const onDown=(e:PointerEvent)=>{pointerStart=[e.clientX,e.clientY];};
    const onUp=(e:PointerEvent)=>{
      if(!pointerStart || Math.hypot(e.clientX-pointerStart[0],e.clientY-pointerStart[1])>5)return;
      pointerStart=null;
      const r=renderer.domElement.getBoundingClientRect();
      const raw=(e.clientX-r.left)/r.width;
      const blueprint=node.dataset.mode==="blueprint";
      const segment=Math.min(2,Math.floor(raw*3));
      pointer.set(2*(blueprint?raw*3-segment:raw)-1,1-2*(e.clientY-r.top)/r.height);
      raycaster.setFromCamera(pointer,blueprint?orthos[segment]!:camera);
      const hits=raycaster.intersectObjects(root.children,true);
      const i=runtime.meshes.findIndex(m=>m.mesh===hits[0]?.object);
      if(i>=0)latestSelect.current(i);
    };
    renderer.domElement.addEventListener("pointerdown",onDown);
    renderer.domElement.addEventListener("pointerup",onUp);
    let last=0;
    const paint=(time:number)=>{
      runtime.frame=requestAnimationFrame(paint);
      if(time-last<48 || !node.isConnected)return;
      last=time;
      const blueprint=node.dataset.mode==="blueprint";
      controls.enabled=!blueprint;controls.update();
      if(blueprint){
        const width=Math.max(node.clientWidth,280),height=Math.max(node.clientHeight,280),part=width/3;
        renderer.setScissorTest(true);
        orthos.forEach((o,i)=>{
          const x=Math.round(i*part);
          const w=Math.round((i+1)*part)-x;
          renderer.setViewport(x,0,w,height);renderer.setScissor(x,0,w,height);
          renderer.render(scene,o);
        });
        renderer.setScissorTest(false);
        renderer.setViewport(0,0,width,height);
      } else renderer.render(scene,camera);
    };
    runtime.frame=requestAnimationFrame(paint);
    const loader=new GLTFLoader();
    loader.parse(bytes.slice(0),"",gltf=>{
      if(closed)return;
      root.add(gltf.scene);
      const bounding=new THREE.Box3().setFromObject(gltf.scene);
      if(bounding.isEmpty()){setError("Hunyuan returned an empty GLB");onError("Empty Hunyuan GLB");return;}
      const size=bounding.getSize(new THREE.Vector3());
      const center=bounding.getCenter(new THREE.Vector3());
      gltf.scene.position.sub(center);
      gltf.scene.scale.setScalar(4.6/Math.max(size.x,size.y,size.z,0.001));
      gltf.scene.traverse(item=>{
        if(item instanceof THREE.Mesh){
          const original=item.material;
          const clone=(m:THREE.Material)=>{
            const material=m.clone();
            if(material instanceof THREE.MeshStandardMaterial){
              material.color.setHex(0x63e5ff);material.wireframe=true;
            }
            return material;
          };
          const blueprint=Array.isArray(original)?original.map(clone):clone(original);
          runtime.meshes.push({
            mesh:item,
            originalPosition:item.position.clone(),
            originalMaterials:original,
            blueprintMaterials:blueprint,
          });
        }
      });
      if(!runtime.meshes.length){setError("Hunyuan GLB has no mesh surfaces");onError("Hunyuan GLB is not a surface mesh");return;}
      onParts(runtime.meshes.map((m,i)=>({name:m.mesh.name || "Hunyuan mesh "+(i+1),meshIndex:i})));
      setLoading(false);
      setRevision(n=>n+1);
    },error=>{
      if(!closed){const message=error instanceof Error?error.message:String(error);
        setError("Cannot load Hunyuan GLB: "+message.slice(0,120));onError(message);}
    });
    return()=>{
      closed=true;cancelAnimationFrame(runtime.frame);
      observer.disconnect();controls.dispose();
      renderer.domElement.removeEventListener("pointerdown",onDown);
      renderer.domElement.removeEventListener("pointerup",onUp);
      runtime.meshes.forEach(record=>{
        const paints=Array.isArray(record.blueprintMaterials)?record.blueprintMaterials:[record.blueprintMaterials];
        paints.forEach(p=>p.dispose());
      });
      scene.traverse(item=>{
        if(item instanceof THREE.Mesh){
          item.geometry.dispose();
          const mats=Array.isArray(item.material)?item.material:[item.material];
          mats.forEach(m=>m.dispose());
        }
      });
      renderer.dispose();renderer.domElement.remove();
      live.current=null;
    };
  },[bytes,title]);

  useEffect(()=>{
    if(host.current)host.current.dataset.mode=mode;
    const st=live.current;if(!st?.meshes.length)return;
    const blueprint=mode==="blueprint",explode=mode==="dissect" && st.meshes.length>1;
    st.scene.background=new THREE.Color(blueprint?"#06223a":"#051727");
    st.meshes.forEach((record,i)=>{
      const mesh=record.mesh;
      mesh.position.copy(record.originalPosition);
      mesh.material=record.originalMaterials;
      if(blueprint)mesh.material=record.blueprintMaterials;
      if(explode){
        const world=new THREE.Vector3();
        mesh.getWorldPosition(world);
        const offset=world.clone();
        if(offset.lengthSq()<0.01)offset.set((i%3)-1,(i%5)-2,1);
        offset.normalize().multiplyScalar(0.65+(i%3)*0.16);
        mesh.position.add(offset);
      }
    });
  },[mode,bytes,revision]);

  useEffect(()=>{
    const st=live.current;if(!st)return;
    st.camera.position.setLength(Math.max(1.7,Math.min(35,7/zoom)));
    st.camera.updateProjectionMatrix();
    st.orthos.forEach(c=>{c.zoom=zoom;c.updateProjectionMatrix();});
  },[zoom,bytes,revision]);
  useEffect(()=>{const st=live.current;if(st)st.root.rotation.y=rotation*Math.PI/180;},[rotation,bytes,revision]);
  useEffect(()=>{
    const st=live.current;if(!st)return;
    st.meshes.forEach(m=>m.mesh.position.copy(m.originalPosition));
    st.root.rotation.set(0,0,0);
  },[reset]);
  useEffect(()=>{
    const st=live.current;if(!st||!move)return;
    const m=st.meshes[move.index];if(!m)return;
    m.originalPosition.add(new THREE.Vector3(...move.delta));
    m.mesh.position.add(new THREE.Vector3(...move.delta));
  },[move?.seq]);
  // Keep WebGL canvas in a dedicated DOM host that React never clears when
  // the loading overlay disappears or mode controls cause a rerender.
  return <div data-mode={mode}
    className="relative h-full min-h-[360px] w-full overflow-hidden"
    aria-label="One real Hunyuan3D model">
    <div ref={host} data-mode={mode} className="absolute inset-0" />
    {(loading||error)&&<div role={error?"alert":"status"}
      className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-[#061420d9] p-4 text-center text-sm text-gold">
      {error||"Loading the actual Hunyuan3D GLB mesh…"}
    </div>}
  </div>;
}
