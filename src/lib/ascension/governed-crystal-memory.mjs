/**
 * Encrypted Library Card governed receipt validation and add-only convergence.
 * A recorded ASCENSION result is NOT physical verification, independent proof,
 * or authorization to contact the governed server. The original stays intact.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_HISTORY=16;
const MAX_BYTES=256*1024;
const STATUSES=new Set(["queued","claimed","running","completed","failed"]);
const rankings={queued:1,claimed:2,running:3,completed:4,failed:4};
const trimlessString=(value,max)=>typeof value==="string" && value.length<=max;
const safeUrl=value=>value===null || (trimlessString(value,2048)&&/^https:\/\/[^<>"\s]+$/i.test(value));

function choice(value) {
  if (!value || typeof value!=="object" || Array.isArray(value) ||
      !trimlessString(value.id,200) || !value.id ||
      !trimlessString(value.title,200) || !value.title.trim() ||
      !trimlessString(value.body,40000) || !value.body.trim() ||
      !Array.isArray(value.parts) || value.parts.length>64 ||
      !Array.isArray(value.limitations) || value.limitations.length>32 ||
      value.limitations.some(v=>!trimlessString(v,2000)) ||
      (value.modelStatus!==null && value.modelStatus!==undefined &&
       !STATUSES.has(value.modelStatus))) {
    throw Error("An archived governed result has an invalid source or description.");
  }
  const parts=value.parts.map(part=>{
    if (!part || typeof part!=="object" || Array.isArray(part) ||
        !trimlessString(part.name,300) || !part.name.trim() ||
        !trimlessString(part.purpose,2000) || !trimlessString(part.location,2000))
      throw Error("An archived governed component is invalid.");
    return {name:part.name,purpose:part.purpose,location:part.location};
  });
  let design=null;
  if (value.design!==null && value.design!==undefined) {
    const d=value.design;
    if (!d || typeof d!=="object" || Array.isArray(d) ||
        !trimlessString(d.title,200) ||
        !trimlessString(d.summary,40000) ||
        !safeUrl(d.imageUrl??null) || !safeUrl(d.blueprintUrl??null) ||
        !safeUrl(d.modelUrl??null))
      throw Error("An archived governed design has invalid media provenance.");
    if (d.imageUrl || d.blueprintUrl || d.modelUrl) design={
      title:d.title,summary:d.summary,
      imageUrl:d.imageUrl??null,blueprintUrl:d.blueprintUrl??null,
      modelUrl:d.modelUrl??null,
    };
  }
  return {
    id:value.id,title:value.title,body:value.body,parts,design,
    limitations:[...value.limitations],modelStatus:value.modelStatus??null,
  };
}
export function validateGovernedReceipt(value) {
  if (!value || typeof value!=="object" || Array.isArray(value) ||
      value.source!=="governed" ||
      !UUID.test(value.requestId) || !UUID.test(value.guestToken) ||
      !trimlessString(value.receivedAt,35) ||
      !Number.isFinite(Date.parse(value.receivedAt)) ||
      !Array.isArray(value.choices) || value.choices.length<1 ||
      value.choices.length>8 ||
      (value.selectedIndex!==null && (!Number.isInteger(value.selectedIndex) ||
       value.selectedIndex<0 || value.selectedIndex>=value.choices.length)))
    throw Error("An archived governed result has invalid credentials, timestamp or pathways.");
  const normalized={
    source:"governed",requestId:value.requestId,guestToken:value.guestToken,
    receivedAt:value.receivedAt,
    choices:value.choices.map(choice),selectedIndex:value.selectedIndex,
  };
  if (new TextEncoder().encode(JSON.stringify(normalized)).length>MAX_BYTES)
    throw Error("A governed result is too large to store without losing its original wording.");
  if (new Set(normalized.choices.map(c=>c.id)).size!==normalized.choices.length)
    throw Error("A governed result has duplicate pathway identities.");
  return normalized;
}
export function validateGovernedHistory(value) {
  if (value===undefined) return [];
  if (!Array.isArray(value) || value.length>MAX_HISTORY)
    throw Error("An archive has an unsupported governed-result history.");
  const result=value.map(validateGovernedReceipt);
  if (new Set(result.map(r=>r.requestId)).size!==result.length)
    throw Error("An archive includes duplicate governed run identities.");
  return result;
}
function mergeChoice(earlier,later) {
  if (earlier.id!==later.id || earlier.title!==later.title ||
      earlier.body!==later.body ||
      JSON.stringify(earlier.parts)!==JSON.stringify(later.parts) ||
      JSON.stringify(earlier.limitations)!==JSON.stringify(later.limitations))
    throw Error("Two copies of a governed run disagree about the original result.");
  const old=earlier.design, next=later.design;
  const imageUrl=old?.imageUrl??next?.imageUrl??null;
  const blueprintUrl=old?.blueprintUrl??next?.blueprintUrl??null;
  const modelUrl=old?.modelUrl??next?.modelUrl??null;
  const status=(rankings[later.modelStatus]??0)>=(rankings[earlier.modelStatus]??0)
    ? later.modelStatus : earlier.modelStatus;
  return {...earlier,modelStatus:status,
    design:imageUrl||blueprintUrl||modelUrl ? {
      title:earlier.title,summary:earlier.body,
      imageUrl,blueprintUrl,modelUrl,
    }:null};
}
export function mergeGovernedHistory(existing,additions) {
  const base=validateGovernedHistory(existing);
  const incoming=validateGovernedHistory(additions);
  const combined=[...base];
  const byId=new Map(combined.map((r,i)=>[r.requestId,i]));
  for (const fresh of incoming) {
    const index=byId.get(fresh.requestId);
    if (index===undefined) {
      if (combined.length>=MAX_HISTORY)
        throw Error("The Library Card has reached its governed-result history limit. Nothing was erased.");
      byId.set(fresh.requestId,combined.length);
      combined.push(fresh);
      continue;
    }
    const saved=combined[index];
    if (saved.guestToken!==fresh.guestToken ||
        saved.choices.length!==fresh.choices.length)
      throw Error("The recorded governed run conflicts with its encrypted history.");
    const choices=saved.choices.map((item,i)=>mergeChoice(item,fresh.choices[i]));
    const selectedIndex=saved.selectedIndex??fresh.selectedIndex;
    combined[index]={...saved,choices,selectedIndex};
  }
  return JSON.stringify(base)===JSON.stringify(combined) ? existing??[] : combined;
}
export function markGovernedSelection(history,requestId,selectedIndex) {
  const validated=validateGovernedHistory(history);
  const index=validated.findIndex(r=>r.requestId===requestId);
  if (index<0 || !Number.isInteger(selectedIndex) ||
      selectedIndex<0 || selectedIndex>=validated[index].choices.length)
    throw Error("The selected governed result is not saved on this Library Card.");
  if (validated[index].selectedIndex===selectedIndex) return history;
  return validated.map((r,i)=>i===index?{...r,selectedIndex}:r);
}
