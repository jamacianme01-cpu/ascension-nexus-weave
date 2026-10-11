import {useEffect,useRef,useState} from 'react';
import {ZoomIn,ZoomOut,Scan,Focus} from 'lucide-react';
import {Button} from '@/components/ui/button';
import type {DesignPart} from '@/lib/ascension/parts-model';
import {fitImage,zoomImage,type ImageTransform} from './reality-demonstration';

export function RealityDissection({imageUrl,parts,selected,onSelect,label}:{imageUrl:string;parts:DesignPart[];selected:number|null;onSelect:(index:number)=>void;label:string}) {
 const host=useRef<HTMLDivElement>(null);
 const [size,setSize]=useState({width:1,height:1});
 const [natural,setNatural]=useState({width:1,height:1});
 const [transform,setTransform]=useState<ImageTransform>({x:0,y:0,zoom:1});
 const state=useRef(transform);state.current=transform;
 const pointers=useRef(new Map<number,{x:number;y:number}>());
 const fit=fitImage(size.width,size.height,natural.width,natural.height);
 const reset=()=>setTransform({x:0,y:0,zoom:1});
 useEffect(()=>{reset();},[imageUrl]);
 useEffect(()=>{const el=host.current;if(!el)return;const observer=new ResizeObserver(()=>setSize({width:el.clientWidth,height:el.clientHeight}));observer.observe(el);
 const wheel=(event:WheelEvent)=>{event.preventDefault();const r=el.getBoundingClientRect();const dy=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?100:1);setTransform(current=>zoomImage(current,current.zoom*Math.exp(-dy*.0015),event.clientX-r.left,event.clientY-r.top));};
 el.addEventListener('wheel',wheel,{passive:false});return()=>{observer.disconnect();el.removeEventListener('wheel',wheel);};},[]);
 const zoom=(factor:number)=>setTransform(current=>zoomImage(current,current.zoom*factor,size.width/2,size.height/2));
 const focus=()=>{const part=selected===null?null:parts[selected];if(!part)return;const z=2.5;const surface=host.current?.getBoundingClientRect();const inspector=host.current?.closest('.reality-screen')?.querySelector('.reality-parts')?.getBoundingClientRect();const visibleHeight=surface && inspector && inspector.left<surface.right && inspector.right>surface.left ? Math.max(88,Math.min(size.height,inspector.top-surface.top)) : size.height;setTransform({zoom:z,x:size.width/2-(fit.x+part.x*fit.width)*z,y:visibleHeight/2-(fit.y+part.y*fit.height)*z});};
 return <div className="reality-dissection" aria-label="Generated dissected illustration with selectable labeled parts">
 <div ref={host} className="reality-image-surface" onPointerDown={event=>{if((event.target as HTMLElement).closest('button'))return;event.currentTarget.setPointerCapture(event.pointerId);pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY});}}
 onPointerMove={event=>{const old=pointers.current.get(event.pointerId);if(!old)return;const other=[...pointers.current.entries()].find(([id])=>id!==event.pointerId)?.[1];const next={x:event.clientX,y:event.clientY};if(other){const before=Math.hypot(old.x-other.x,old.y-other.y);const after=Math.hypot(next.x-other.x,next.y-other.y);const r=event.currentTarget.getBoundingClientRect();setTransform(current=>zoomImage(current,current.zoom*after/Math.max(1,before),(next.x+other.x)/2-r.left,(next.y+other.y)/2-r.top));}else setTransform(current=>({...current,x:current.x+next.x-old.x,y:current.y+next.y-old.y}));pointers.current.set(event.pointerId,next);}}
 onPointerUp={event=>pointers.current.delete(event.pointerId)} onPointerCancel={event=>pointers.current.delete(event.pointerId)}>
 <div className="reality-image-transform" style={{transform:`translate(${transform.x}px,${transform.y}px) scale(${transform.zoom})`}}>
 <div className="reality-dissection-picture" style={{width:fit.width,height:fit.height,left:fit.x,top:fit.y}}>
 <img src={imageUrl} alt={`Separated concept illustration of ${label}`} draggable={false} onLoad={event=>setNatural({width:event.currentTarget.naturalWidth,height:event.currentTarget.naturalHeight})}/>
 {parts.map((part,index)=><Button variant="outline" className="reality-dissection-label" key={part.name+index} style={{left:`${part.x*100}%`,top:`${part.y*100}%`,transform:`translate(-50%,-100%) scale(${1/transform.zoom})`}} aria-label={`${part.name}: ${part.purpose}`} aria-controls="reality-part-detail" aria-pressed={selected===index} onClick={()=>onSelect(index)}>{part.name}</Button>)}
 {selected!==null && parts[selected] && <span className="reality-dissection-target" data-x={parts[selected].x} data-y={parts[selected].y} style={{left:`${parts[selected].x*100}%`,top:`${parts[selected].y*100}%`}} aria-hidden="true"/>}
 </div></div></div>
 <div className="reality-image-tools" role="group" aria-label="Illustration controls">
 <Button variant="outline" size="icon" aria-label="Zoom illustration in" title="Zoom in" onClick={()=>zoom(1.3)}><ZoomIn/></Button>
 <Button variant="outline" size="icon" aria-label="Zoom illustration out" title="Zoom out" onClick={()=>zoom(1/1.3)}><ZoomOut/></Button>
 <Button variant="outline" size="icon" aria-label="Fit illustration" title="Fit / reset" onClick={reset}><Scan/></Button>
 <Button variant="outline" size="icon" aria-label="Focus selected part" title="Focus selected part" disabled={selected===null} onClick={focus}><Focus/></Button>
 <output aria-label="Illustration zoom">{Math.round(transform.zoom*100)}%</output>
 </div></div>;
}
