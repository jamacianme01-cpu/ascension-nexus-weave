import * as THREE from 'three';

/** Separate disconnected mesh islands. Never invent hidden component geometry. */
export function splitMeshIslands(mesh: THREE.Mesh): THREE.Mesh[] {
  const geometry=mesh.geometry;
  const position=geometry.getAttribute('position');
  if (!position || geometry.groups.length > 1 || mesh instanceof THREE.SkinnedMesh) return [mesh];
  const count=geometry.index?.count ?? position.count;
  if(count<6 || count%3) return [mesh];
  geometry.computeBoundingBox();
  const extent=geometry.boundingBox!.getSize(new THREE.Vector3()).length();
  const tolerance=Math.max(extent*1e-6,1e-8);
  const parent=new Int32Array(position.count);
  const canonical=new Int32Array(position.count);
  const coordinates=new Map<string,number>();
  for(let i=0;i<position.count;i++) {
    parent[i]=i;
    const key=[position.getX(i),position.getY(i),position.getZ(i)].map(value=>Math.round(value/tolerance)).join(',');
    const prior=coordinates.get(key);
    canonical[i]=prior??i;
    if(prior===undefined)coordinates.set(key,i);
  }
  const root=(value:number):number=>{while(parent[value]!==value){parent[value]=parent[parent[value]!]!;value=parent[value]!;}return value;};
  const join=(a:number,b:number)=>{a=root(a);b=root(b);if(a!==b)parent[b]=a;};
  const vertex=(i:number)=>geometry.index?.getX(i)??i;
  for(let i=0;i<count;i+=3){join(canonical[vertex(i)]!,canonical[vertex(i+1)]!);join(canonical[vertex(i)]!,canonical[vertex(i+2)]!);}
  const islands=new Map<number,number[]>();
  for(let i=0;i<count;i+=3){const key=root(canonical[vertex(i)]!);let indices=islands.get(key);if(!indices){indices=[];islands.set(key,indices);}indices.push(vertex(i),vertex(i+1),vertex(i+2));}
  if(islands.size===1 || islands.size>256)return [mesh];
  const sorted=[...islands.values()].sort((a,b)=>b.length-a.length);
  // Keep small disconnected surface fragments with the original assembly.
  const groups=sorted.filter(indices=>indices.length>=24).slice(0,48);
  const leftovers=sorted.filter(indices=>!groups.includes(indices)).flat();
  if(leftovers.length)groups.push(leftovers);
  if(groups.length<2)return [mesh];
  return groups.map((indices,index)=>{
    const unique=[...new Set(indices)];const remap=new Map(unique.map((id,i)=>[id,i]));
    const partGeometry=new THREE.BufferGeometry();
    for(const [name,attribute] of Object.entries(geometry.attributes)) {
      if(attribute.itemSize>4)continue;
      const values=new Float32Array(unique.length*attribute.itemSize);
      unique.forEach((id,i)=>{const valuesAt=[attribute.getX(id),attribute.getY(id),attribute.getZ(id),attribute.getW(id)];for(let c=0;c<attribute.itemSize;c++)values[i*attribute.itemSize+c]=valuesAt[c]!;});
      partGeometry.setAttribute(name,new THREE.BufferAttribute(values,attribute.itemSize));
    }
    partGeometry.setIndex(indices.map(id=>remap.get(id)!));
    partGeometry.computeBoundingBox();const pivot=partGeometry.boundingBox!.getCenter(new THREE.Vector3());partGeometry.translate(-pivot.x,-pivot.y,-pivot.z);
    const materials=[mesh.material].flat().map(material=>material.clone());
    const part=new THREE.Mesh(partGeometry,Array.isArray(mesh.material)?materials:materials[0]);
    part.position.copy(pivot);part.name=`${mesh.name||'Component'} ${index+1}`;part.castShadow=mesh.castShadow;part.receiveShadow=mesh.receiveShadow;
    return part;
  });
}

/** Attach an actual source component beside the target, preserving scale/orientation. */
export function attachComponent(source: THREE.Object3D,target: THREE.Object3D): void {
  if(source===target || isAncestor(source,target))throw new Error('Choose two independent components.');
  source.updateWorldMatrix(true,true);target.updateWorldMatrix(true,true);
  const a=new THREE.Box3().setFromObject(source);const b=new THREE.Box3().setFromObject(target);
  const delta=new THREE.Vector3(b.max.x-a.min.x,b.getCenter(new THREE.Vector3()).y-a.getCenter(new THREE.Vector3()).y,b.getCenter(new THREE.Vector3()).z-a.getCenter(new THREE.Vector3()).z);
  const world=source.getWorldPosition(new THREE.Vector3()).add(delta);
  const desired=source.matrixWorld.clone();desired.setPosition(world);
  const mount=new THREE.Group();mount.name='Component connection';mount.matrixAutoUpdate=false;
  mount.matrix.copy(target.matrixWorld).invert().multiply(desired);
  target.add(mount);mount.add(source);source.position.set(0,0,0);source.quaternion.identity();source.scale.set(1,1,1);source.updateMatrix();source.updateWorldMatrix(true,true);
}
export function isAncestor(parent:THREE.Object3D,child:THREE.Object3D):boolean { for(let node=child.parent;node;node=node.parent)if(node===parent)return true;return false; }
