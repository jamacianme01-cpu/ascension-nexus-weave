import type { ObjectivePathway } from '@/lib/ascension/result-model';
import type { DesignPart } from '@/lib/ascension/parts-model';

export interface DemonstrationPhase { caption: string; partNames: string[]; operation: string }
export const DEMONSTRATION_SECONDS = 12;
export function demonstrationPhases(pathway: ObjectivePathway, parts: DesignPart[]): DemonstrationPhase[] {
  const steps = pathway.steps.filter(step => typeof step === 'string' && step.trim()).slice(0, 8);
  if (!steps.length) return parts.filter(part => part.operation && !/unavailable/i.test(part.operation)).slice(0, 6).map(part => ({caption: part.name, operation: part.operation, partNames: [part.name]}));
  return steps.map(caption => {
    const words = caption.toLowerCase();
    const related = parts.filter(part => part.name.toLowerCase().split(/\W+/).filter(word => word.length > 3).some(word => words.includes(word)));
    return {caption, partNames: related.map(part => part.name), operation: related.map(part => part.operation).join(' · ')};
  });
}
export function demonstrationFrame(seconds: number, count: number) {
  const bounded = Math.max(0, Math.min(DEMONSTRATION_SECONDS, seconds));
  const progress = bounded / DEMONSTRATION_SECONDS * count;
  return {index: Math.min(Math.max(0, count - 1), Math.floor(progress)), progress: bounded === DEMONSTRATION_SECONDS ? 1 : progress % 1};
}
export interface ImageTransform {x:number;y:number;zoom:number}
export function zoomImage(state: ImageTransform, nextZoom:number, x:number, y:number): ImageTransform {
  const zoom = Math.min(6, Math.max(1, nextZoom));
  const k = zoom / state.zoom;
  return {zoom, x:x-(x-state.x)*k, y:y-(y-state.y)*k};
}
export function fitImage(width:number,height:number,imageWidth:number,imageHeight:number) {
  const scale=Math.min(width/Math.max(1,imageWidth),height/Math.max(1,imageHeight));
  return {width:imageWidth*scale,height:imageHeight*scale,x:(width-imageWidth*scale)/2,y:(height-imageHeight*scale)/2};
}
export function groundedComponent(name:string, components:Array<{id:string;name:string;detail:DesignPart|null}>) {
  const normalize=(value:string)=>value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  const matches=components.filter(component=>component.detail && normalize(component.detail.name)===normalize(name));
  return matches.length===1 ? matches[0] : null;
}
