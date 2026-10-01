import { useEffect, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import type { ObjectiveDelivery } from "@/lib/ascension/result-model";

type Pathway = ObjectiveDelivery["pathways"][number];
type Props = {
  delivery: ObjectiveDelivery;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onUse: (pathway: Pathway) => void;
};

type Vec3 = [number, number, number];
type Mesh = { buffer: WebGLBuffer; count: number };

const PATH_SLOTS = [
  { left: "17%", top: "24%", pos: [-3.25, 1.35, 0.25] as Vec3 },
  { left: "83%", top: "24%", pos: [3.25, 1.35, 0.25] as Vec3 },
  { left: "19%", top: "67%", pos: [-3.05, -1.55, 0.35] as Vec3 },
  { left: "81%", top: "67%", pos: [3.05, -1.55, 0.35] as Vec3 },
];

function matIdentity() {
  return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
}
function matMul(a: Float32Array,b: Float32Array) {
  const o=new Float32Array(16);
  for(let c=0;c<4;c++) for(let r=0;r<4;r++) o[c*4+r]=
    a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];
  return o;
}
function translate(x:number,y:number,z:number){const m=matIdentity();m[12]=x;m[13]=y;m[14]=z;return m;}
function scale(x:number,y:number,z:number){const m=matIdentity();m[0]=x;m[5]=y;m[10]=z;return m;}
function rotX(a:number){const c=Math.cos(a),s=Math.sin(a);return new Float32Array([1,0,0,0,0,c,s,0,0,-s,c,0,0,0,0,1]);}
function rotY(a:number){const c=Math.cos(a),s=Math.sin(a);return new Float32Array([c,0,-s,0,0,1,0,0,s,0,c,0,0,0,0,1]);}
function rotZ(a:number){const c=Math.cos(a),s=Math.sin(a);return new Float32Array([c,s,0,0,-s,c,0,0,0,1,0,0,0,0,0,1]);}
function compose(p:Vec3,r:Vec3=[0,0,0],s:Vec3=[1,1,1]){
  let m=translate(...p); m=matMul(m,rotZ(r[2])); m=matMul(m,rotY(r[1])); m=matMul(m,rotX(r[0])); return matMul(m,scale(...s));
}
function perspective(fov:number,aspect:number,near:number,far:number){
  const f=1/Math.tan(fov/2),nf=1/(near-far),o=new Float32Array(16);
  o[0]=f/aspect;o[5]=f;o[10]=(far+near)*nf;o[11]=-1;o[14]=2*far*near*nf;return o;
}
function norm(v:Vec3):Vec3{const d=Math.hypot(...v)||1;return[v[0]/d,v[1]/d,v[2]/d];}
function cross(a:Vec3,b:Vec3):Vec3{return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
function dot(a:Vec3,b:Vec3){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
function lookAt(eye:Vec3,center:Vec3,up:Vec3){
  const z=norm([eye[0]-center[0],eye[1]-center[1],eye[2]-center[2]]),x=norm(cross(up,z)),y=cross(z,x);
  return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1]);
}
function cubeVertices(){
  const f:Array<[Vec3,Vec3,Vec3,Vec3,Vec3]>=[
    [[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1],[0,0,1]],[[1,-1,-1],[-1,-1,-1],[-1,1,-1],[1,1,-1],[0,0,-1]],
    [[-1,1,1],[1,1,1],[1,1,-1],[-1,1,-1],[0,1,0]],[[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1],[0,-1,0]],
    [[1,-1,1],[1,-1,-1],[1,1,-1],[1,1,1],[1,0,0]],[[-1,-1,-1],[-1,-1,1],[-1,1,1],[-1,1,-1],[-1,0,0]],
  ],d:number[]=[]; const q=(p:Vec3,n:Vec3)=>d.push(...p,...n);
  f.forEach(([a,b,c,e,n])=>{q(a,n);q(b,n);q(c,n);q(a,n);q(c,n);q(e,n);}); return new Float32Array(d);
}
function torusVertices(seg=30,tube=10){
  const d:number[]=[]; const v=(u:number,w:number)=>{const cu=Math.cos(u),su=Math.sin(u),cw=Math.cos(w),sw=Math.sin(w),R=1,r=.18; return {p:[(R+r*cw)*cu,(R+r*cw)*su,r*sw] as Vec3,n:[cw*cu,cw*su,sw] as Vec3};};
  const q=(x:{p:Vec3,n:Vec3})=>d.push(...x.p,...x.n);
  for(let i=0;i<seg;i++){const u0=i/seg*Math.PI*2,u1=(i+1)/seg*Math.PI*2;for(let j=0;j<tube;j++){const w0=j/tube*Math.PI*2,w1=(j+1)/tube*Math.PI*2,a=v(u0,w0),b=v(u1,w0),c=v(u1,w1),e=v(u0,w1);q(a);q(b);q(c);q(a);q(c);q(e);}}
  return new Float32Array(d);
}
function sphereVertices(lat=16,lon=22){
  const d:number[]=[]; const v=(a:number,b:number)=>{const s=Math.sin(a),p:[number,number,number]=[s*Math.cos(b),Math.cos(a),s*Math.sin(b)];return{p:p as Vec3,n:p as Vec3};}; const q=(x:{p:Vec3,n:Vec3})=>d.push(...x.p,...x.n);
  for(let i=0;i<lat;i++){const a0=i/lat*Math.PI,a1=(i+1)/lat*Math.PI;for(let j=0;j<lon;j++){const b0=j/lon*Math.PI*2,b1=(j+1)/lon*Math.PI*2,A=v(a0,b0),B=v(a1,b0),C=v(a1,b1),E=v(a0,b1);q(A);q(B);q(C);q(A);q(C);q(E);}}
  return new Float32Array(d);
}
function shader(gl:WebGLRenderingContext,type:number,src:string){const s=gl.createShader(type);if(!s)throw new Error("shader");gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s)||"shader");return s;}
function program(gl:WebGLRenderingContext){
  const vs=shader(gl,gl.VERTEX_SHADER,`attribute vec3 aP;attribute vec3 aN;uniform mat4 uM;uniform mat4 uVP;varying vec3 vN;varying vec3 vW;void main(){vec4 w=uM*vec4(aP,1.0);vW=w.xyz;vN=normalize(mat3(uM)*aN);gl_Position=uVP*w;}`);
  const fs=shader(gl,gl.FRAGMENT_SHADER,`precision mediump float;uniform vec3 uC;uniform vec3 uEye;uniform float uGlow;varying vec3 vN;varying vec3 vW;void main(){vec3 n=normalize(vN),l=normalize(vec3(-.45,.72,.68)),v=normalize(uEye-vW);float d=max(dot(n,l),0.0),rim=pow(1.0-max(dot(n,v),0.0),2.8),scan=.96+.04*sin(vW.y*42.0);vec3 c=(uC*(.16+d*.50)+uC*rim*(.42+uGlow*.48))*scan;c+=vec3(.03,.13,.18)*uGlow*.18;gl_FragColor=vec4(min(c,vec3(.92)),.84);}`);
  const p=gl.createProgram();if(!p)throw new Error("program");gl.attachShader(p,vs);gl.attachShader(p,fs);gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p)||"link");gl.deleteShader(vs);gl.deleteShader(fs);return p;
}
function mesh(gl:WebGLRenderingContext,data:Float32Array):Mesh{const b=gl.createBuffer();if(!b)throw new Error("buffer");gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);return{buffer:b,count:data.length/6};}
function hue(i:number):Vec3{return i===0?[.12,.78,1]:i===1?[.45,.42,1]:i===2?[.08,1,.68]:[1,.38,.22];}

export function Envision3DScene({delivery,selectedId,onSelect,onUse}:Props){
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const selectedRef=useRef(selectedId);
  const rotationRef=useRef({x:-.18,y:.45});
  const zoomRef=useRef(1);
  const dragRef=useRef<{x:number;y:number;active:boolean;moved:boolean}>({x:0,y:0,active:false,moved:false});
  const [dragging,setDragging]=useState(false);
  const [webglError,setWebglError]=useState(false);
  const paths=useMemo(()=>delivery.pathways.slice(0,4),[delivery.pathways]);
  const choices=useMemo(()=>delivery.blend?[...paths,delivery.blend]:paths,[paths,delivery.blend]);
  const selected=choices.find(x=>x.id===selectedId)??null;
  const isBlend=Boolean(selected&&delivery.blend?.id===selected.id);

  useEffect(()=>{selectedRef.current=selectedId;rotationRef.current={x:-.18,y:.45};zoomRef.current=1;},[selectedId]);

  useEffect(()=>{
    const canvas=canvasRef.current;if(!canvas)return;
    const gl=canvas.getContext("webgl",{alpha:true,antialias:true,premultipliedAlpha:false});
    if(!gl){setWebglError(true);return;}
    let p:WebGLProgram,cube:Mesh,torus:Mesh,sphere:Mesh,raf=0,dead=false;
    try{p=program(gl);cube=mesh(gl,cubeVertices());torus=mesh(gl,torusVertices());sphere=mesh(gl,sphereVertices());}catch{setWebglError(true);return;}
    const aP=gl.getAttribLocation(p,"aP"),aN=gl.getAttribLocation(p,"aN"),uM=gl.getUniformLocation(p,"uM"),uVP=gl.getUniformLocation(p,"uVP"),uC=gl.getUniformLocation(p,"uC"),uEye=gl.getUniformLocation(p,"uEye"),uGlow=gl.getUniformLocation(p,"uGlow");
    gl.useProgram(p);gl.enable(gl.DEPTH_TEST);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.clearColor(0,0,0,0);
    const bind=(m:Mesh)=>{gl.bindBuffer(gl.ARRAY_BUFFER,m.buffer);gl.enableVertexAttribArray(aP);gl.vertexAttribPointer(aP,3,gl.FLOAT,false,24,0);gl.enableVertexAttribArray(aN);gl.vertexAttribPointer(aN,3,gl.FLOAT,false,24,12);};
    const draw=(m:Mesh,model:Float32Array,vp:Float32Array,color:Vec3,glow:number)=>{bind(m);gl.uniformMatrix4fv(uM,false,model);gl.uniformMatrix4fv(uVP,false,vp);gl.uniform3f(uC,...color);gl.uniform1f(uGlow,glow);gl.drawArrays(gl.TRIANGLES,0,m.count);};
    const engine=(vp:Float32Array,pos:Vec3,color:Vec3,active:boolean,t:number,index:number,blend=false)=>{
      const focus=selectedRef.current!==null&&active, k=focus?.92*zoomRef.current:1, r=focus?rotationRef.current:{x:-.16,y:t*.08+index*.72};
      const base=focus?[0,.22,.15] as Vec3:pos, glow=focus?.42:(active?.72:.34);
      // Stable inspection silhouette: twin rails, central core, three coil stations and a forward energy guide.
      draw(cube,compose([base[0],base[1]-.68*k,base[2]],[0,r.y*.12,0],[1.38*k,.055,.62*k]),vp,[.035,.12,.18],glow*.22);
      draw(cube,compose(base,[r.x,r.y,0],[.92*k,.22*k,.30*k]),vp,blend?[.88,.45,.08]:color,glow*.72);
      for(let q=-1;q<=1;q+=2)draw(cube,compose([base[0],base[1]+q*.42*k,base[2]-.02],[r.x*.18,r.y,0],[1.35*k,.038,.038]),vp,color,glow*.68);
      for(let ring=-1;ring<=1;ring++)draw(torus,compose([base[0]+ring*.58*k,base[1],base[2]],[Math.PI/2+r.x*.55,r.y,0],[.34*k,.34*k,.34*k]),vp,ring===0?[.42,.86,1]:color,glow*.72);
      draw(cube,compose([base[0]+1.48*k,base[1],base[2]],[0,0,0],[.66*k,.018,.018]),vp,[.30,.78,.96],.56);
      if(blend){draw(torus,compose(base,[0,focus?r.y:t*.12,Math.PI/3],[.90*k,.90*k,.90*k]),vp,[.88,.56,.12],.48);draw(sphere,compose(base,[0,focus?0:t*.08,0],[.32*k,.32*k,.32*k]),vp,[.80,.42,.08],.42);}
    };
    const render=(ms:number)=>{if(dead)return;const t=ms*.001,rect=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2),w=Math.max(1,Math.round(rect.width*dpr)),h=Math.max(1,Math.round(rect.height*dpr));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}gl.viewport(0,0,w,h);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);const eye:Vec3=[selectedRef.current?0:Math.sin(t*.08)*.12,selectedRef.current?0:Math.sin(t*.1)*.04,10.4],vp=matMul(perspective(Math.PI/4.3,w/h,.1,40),lookAt(eye,[0,0,0],[0,1,0]));gl.uniform3f(uEye,...eye);
      const focused=selectedRef.current;
      if(focused){const path=paths.find(x=>x.id===focused);if(path){const i=paths.indexOf(path);engine(vp,[0,0,.7],hue(i),true,t,i,false);}else if(delivery.blend?.id===focused){engine(vp,[0,0,.7],[1,.66,.18],true,t,4,true);}}
      else{paths.forEach((path,i)=>engine(vp,PATH_SLOTS[i]?.pos??[0,0,0],hue(i),false,t,i,false));if(delivery.blend)engine(vp,[0,-.12,.78],[1,.66,.18],false,t,4,true);}
      raf=requestAnimationFrame(render);
    };raf=requestAnimationFrame(render);
    return()=>{dead=true;cancelAnimationFrame(raf);[cube,torus,sphere].forEach(m=>gl.deleteBuffer(m.buffer));gl.deleteProgram(p);};
  },[delivery.blend,paths]);

  const pointerDown=(e:PointerEvent<HTMLCanvasElement>)=>{if(!selectedId)return;dragRef.current={x:e.clientX,y:e.clientY,active:true,moved:false};setDragging(true);e.currentTarget.setPointerCapture(e.pointerId);};
  const pointerMove=(e:PointerEvent<HTMLCanvasElement>)=>{const d=dragRef.current;if(!d.active||!selectedId)return;const dx=e.clientX-d.x,dy=e.clientY-d.y;if(Math.abs(dx)+Math.abs(dy)>2)d.moved=true;rotationRef.current.y+=dx*.009;rotationRef.current.x+=dy*.009;d.x=e.clientX;d.y=e.clientY;};
  const pointerUp=(e:PointerEvent<HTMLCanvasElement>)=>{dragRef.current.active=false;setDragging(false);try{e.currentTarget.releasePointerCapture(e.pointerId);}catch{}};
  const wheel=(e:WheelEvent<HTMLCanvasElement>)=>{if(!selectedId)return;e.preventDefault();zoomRef.current=Math.min(1.85,Math.max(.65,zoomRef.current-e.deltaY*.001));};

  return <div className="ascension-envision-3d" data-focused={selectedId?"true":"false"}>
    <canvas ref={canvasRef} className={dragging?"is-dragging":""} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onWheel={wheel} aria-label="Interactive 3D holographic ENVISION scene" />
    <div className="ascension-envision-heading"><span>ENVISION MODE</span><strong>{selected?"HOLOGRAPHIC REALITY · DRAG TO ROTATE · SCROLL TO ZOOM":"SELECT A HOLOGRAPHIC REALITY"}</strong></div>
    {!selected&&paths.map((path,i)=><button key={path.id} className="ascension-holo-hit" style={{left:PATH_SLOTS[i]?.left,top:PATH_SLOTS[i]?.top}} onClick={()=>onSelect(path.id)}><span>PATH {String(i+1).padStart(2,"0")}</span><strong>{path.label}</strong>{path.outcome_score!==null&&<em>{Math.round(path.outcome_score*100)}%</em>}</button>)}
    {!selected&&delivery.blend&&<button className="ascension-holo-hit ascension-holo-hit--blend" style={{left:"50%",top:"50%"}} onClick={()=>onSelect(delivery.blend!.id)}><span>BLEND REALITIES</span><strong>SPIRAL + OUTCOME</strong>{delivery.blend.outcome_score!==null&&<em>{Math.round(delivery.blend.outcome_score*100)}%</em>}</button>}
    {webglError&&<div className="ascension-holo-error">3D acceleration is unavailable in this browser.</div>}
    {selected&&<div className={isBlend?"ascension-holo-focus ascension-holo-focus--blend":"ascension-holo-focus"}><div><p>{isBlend?"BLEND REALITY":"ENVISIONED REALITY"}</p><h3>{selected.label}</h3><span>{selected.summary}</span></div><div className="ascension-holo-actions"><button onClick={()=>{rotationRef.current={x:-.18,y:.45};zoomRef.current=1;}}>RESET VIEW</button><button onClick={()=>onSelect(null)}>BACK</button><button onClick={()=>onUse(selected)}>{isBlend?"OPEN BLEND":"OPEN REALITY"}</button></div></div>}
  </div>;
}
