/** Bound spoken turns without leaving a paragraph or a cut-off word. */
export function briefSpokenAnswer(text: string, maxWords=45): string {
  const sentences=text.trim().replace(/\s+/g," ").split(/(?<=[.!?])\s+/).slice(0,2);
  let result="";
  for(const sentence of sentences){
    if((result+" "+sentence).trim().split(/\s+/).length>maxWords)break;
    result+=(result?" ":"")+sentence;
  }
  if(result)return result;
  return text.trim().split(/\s+/).slice(0,maxWords).join(" ").replace(/[,;:]$/,"")+"…";
}
