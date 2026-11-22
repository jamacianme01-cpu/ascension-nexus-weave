import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  CrystalSurface, type CrystalDesign, type RevealedPart,
} from "../../src/components/ascension/crystal-surface";
import type { DesignView } from "../../src/components/ascension/v1-design-viewport";

const picture="data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2040%2040'%3E%3Crect%20width='40'%20height='40'%20fill='%234faadd'/%3E%3C/svg%3E";
const recorded: CrystalDesign = {
  title:"Recorded owner pathway",summary:"Recorded result; no fabricated model",
  imageUrl:picture,blueprintUrl:null,modelUrl:null,
};
const components: RevealedPart[] = [{
  name:"Shared memory dock",location:"Inside recorded dock housing",
  purpose:"Unifies the two recorded drone memories",
},{
  name:"Guidance drone",location:"Mobile unit",
  purpose:"Gives guidance using the real recorded pathway",
}];
function Fixture() {
  const [visible,setVisible] = useState(false);
  const [available,setAvailable] = useState(true);
  const [view,setView] = useState<DesignView>("assembled");
  const [spoken,setSpoken] = useState("");
  return <div style={{position:"relative",width:"100vw",height:"100vh",minHeight:550}}>
    <button type="button" id="reveal-fixture" onClick={() => setVisible(true)}>Select saved real pathway</button>
    <button type="button" id="hide-media" onClick={() => setAvailable(false)}>Test unavailable media</button>
    <button type="button" id="show-dissect" onClick={() => setView("dissect")}>Switch to Dissect</button>
    <output id="speech-fixture">{spoken}</output>
    <CrystalSurface
      working={false} design={visible ? available ? recorded : {...recorded,imageUrl:null} : null}
      view={view} rotateRequest={0} zoomRequest={0} crystals={[]}
      selectedId={visible ? "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" : null}
      onRecall={() => {}} parts={visible ? components : []}
      onExplainPart={part => setSpoken("What: "+part.name+
        ". Where: "+part.location+". Does: "+part.purpose)}/>
  </div>;
}
createRoot(document.getElementById("root")!).render(<Fixture/>);
