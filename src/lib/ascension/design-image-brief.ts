/** Closed design identity for one selected pathway picture.
 * SDXL paints every concrete noun it is given and drops tokens past its
 * text-encoder limit. Pasting the pathway summary, or listing parts as
 * separate products, is what turned one machine into collages, mixed
 * aircraft, and disconnected components. The prompt is compiled only from
 * this identity. The summary is used to classify the design, then omitted.
 * A generated picture is still an unverified concept, not measured hardware.
 */
export type DesignIdentity = {
  count: 1 | 3;
  mobility: "aerial" | "ground" | "hybrid" | "mechanism";
  architecture: string;
  subject: string;
  prompt: string;
  negative: string;
};

export function clipTokenEstimate(text: string): number {
  const parts = text.toLowerCase().match(/[a-z0-9]+|[^a-z0-9\s]/g) ?? [];
  let tokens = 0;
  for (const part of parts) {
    if (/[^a-z0-9]/.test(part)) tokens += 1;
    else if (part.length > 16) tokens += 3;
    else if (part.length > 9) tokens += 2;
    else tokens += 1;
  }
  return tokens;
}

function bound(text: string, maxTokens: number): string {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const kept = [...words];
  while (kept.length > 4 && clipTokenEstimate(kept.join(" ")) > maxTokens) kept.pop();
  return kept.join(" ");
}

function declaresGroup(text: string): boolean {
  return /\b(?:swarm|fleet|formation|squadron)\b/i.test(text)
    || (/\b(?:drones|robots|bots|aircraft|vehicles)\b/i.test(text)
      && /\b(?:multiple|several|three|matching|identical|coordinated|team)\b/i.test(text));
}

function powerSources(text: string): string[] {
  const found: string[] = [];
  if (/electrohydraulic|electro-hydraulic|\bhydraulic\b/i.test(text)) found.push("hydraulic");
  if (/\bpneumatic\b/i.test(text)) found.push("pneumatic");
  if (/\belectromagnetic\b|\bmaglev\b/i.test(text)) found.push("electromagnetic");
  return found;
}
function firstPower(text: string): string[] {
  const indexed = [
    { name: "hydraulic", at: text.search(/electrohydraulic|electro-hydraulic|\bhydraulic\b/i) },
    { name: "pneumatic", at: text.search(/\bpneumatic\b/i) },
    { name: "electromagnetic", at: text.search(/\belectromagnetic\b|\bmaglev\b/i) },
  ].filter(item => item.at >= 0).sort((a, b) => a.at - b.at);
  return indexed[0] ? [indexed[0].name] : [];
}

function genericSubject(objective: string, title: string): string {
  const named = titleSubject(title);
  if (named.length > 3 && !/^(?:research|plan|guide|approach|idea|concept)$/i.test(named)) return named;
  const line = (objective.split("\nBuild on the selected pathway:")[0] ?? objective)
    .replace(/^(?:please\s+)?(?:make|build|create|design|develop|invent|engineer|construct)\s+(?:me\s+)?(?:an?\s+|the\s+)?/i, "")
    .split(/[,.\n]/)[0] ?? "";
  const words = line.replace(/\s+/g, " ").trim().split(" ").filter(Boolean).slice(0, 8);
  return words.join(" ") || "assembled object";
}

function titleSubject(title: string): string {
  return title.replace(/\b(?:architecture|concept|approach|pathway|design)\b/gi, " ")
    .replace(/\s+/g, " ").trim().slice(0, 80);
}

export function compileDesignIdentity(objective: string, title: string, parts: string[], summary = ""): DesignIdentity {
  // Parts stay on the pathway record. Naming them in the prompt makes SDXL
  // draw each one as its own product, which is the disconnected-component failure.
  void parts;
  const pathway = `${title} ${summary}`;
  const lead = summary.split(/[.!?]/)[0] ?? "";
  const titleGroup = declaresGroup(title);
  const count: 1 | 3 = titleGroup || (declaresGroup(lead) && !(/\b(?:one|single|individual)\b/i.test(`${title} ${lead}`) && !titleGroup)) ? 3 : 1;
  const ground = /\b(?:ground-based|ground robot|wheeled|tracked|rover|wheels|tires)\b/i.test(pathway);
  const aerialSignal = /\b(?:drones?|aerial|multirotor|hexacopter|quadcopter|rotor|flying)\b/i.test(pathway);
  const objectiveAerial = /\b(?:drones?|aerial|multirotor)\b/i.test(objective);
  const hybrid = /\bhybrid\b/i.test(title) && ground && /aerial|fly|rotor/i.test(pathway);
  const aerial = !ground && (aerialSignal || objectiveAerial);
  const mobility: DesignIdentity["mobility"] = hybrid ? "hybrid" : aerial ? "aerial" : ground ? "ground" : "mechanism";
  const worker = /\b(?:worker|labor|labour)\b/i.test(`${objective} ${title}`);
  const aircraft = /hexacopter|\bhexa\b|six[- ]rotor/i.test(pathway) ? "hexacopter"
    : /quadcopter|\bquad\b|four[- ]rotor/i.test(pathway) ? "quadcopter" : "multirotor";
  const linearFamily = /\b(?:linear|rail)\b/i.test(`${pathway} ${objective}`)
    && /\b(?:engine|propulsion|motor|accelerator|drive)\b/i.test(`${pathway} ${objective}`);
  const titleHits = powerSources(title);
  const leadHits = powerSources(lead);
  const hits = titleHits.length ? titleHits
    : leadHits.length >= 2 && /\b(?:blend|combin|integrat)/i.test(`${title} ${lead}`) ? leadHits
    : firstPower(lead);
  let architecture = "";
  if (linearFamily && hits.length >= 2) architecture = "integrated linear propulsion";
  else if (linearFamily && /electrohydraulic|electro-hydraulic/i.test(`${title} ${lead}`)) architecture = "electrohydraulic linear propulsion";
  else if (linearFamily && hits.includes("hydraulic")) architecture = "hydraulic linear propulsion";
  else if (linearFamily && hits.includes("pneumatic")) architecture = "pneumatic linear propulsion";
  else if (linearFamily && hits.includes("electromagnetic")) architecture = "electromagnetic linear propulsion";
  else if (linearFamily) architecture = "linear propulsion";
  const railSubject: Record<string, string> = {
    "electromagnetic linear propulsion": "long horizontal electromagnetic track with one sliding carriage",
    "pneumatic linear propulsion": "long horizontal pneumatic cylinder driving one carriage",
    "electrohydraulic linear propulsion": "long horizontal hydraulic ram driving one carriage",
    "hydraulic linear propulsion": "long horizontal hydraulic cylinder driving one carriage",
    "integrated linear propulsion": "long horizontal linear track with one sliding carriage",
    "linear propulsion": "long horizontal linear track with one sliding carriage",
  };
  const specialized = hybrid
    ? (worker ? "aerial and ground hybrid worker robot" : "aerial and ground hybrid robot")
    : aerial ? `unmanned ${aircraft}${worker ? " worker drone" : " drone"}`
    : ground && (worker || /\brobot\b/i.test(pathway))
      ? `${/tracked/i.test(pathway) ? "tracked" : "wheeled"} ground ${worker ? "worker " : ""}robot`
      : railSubject[architecture] || "";
  const subject = specialized || genericSubject(objective, title);
  const head = count === 3
    ? `Exactly three identical ${subject}s in one group, single photograph`
    : `One single ${subject}, one complete assembled machine, single photograph`;
  const prompt = bound(`${head}, plain gray studio background`, 68);
  const negative = bound([
    "collage, split screen, triptych, multiple views, catalog sheet, exploded view",
    count === 1 ? "two objects, three machines, duplicate product, extra machine, second vehicle" : "one aircraft, two aircraft, four aircraft, mismatched vehicles, mixed designs",
    mobility === "aerial" ? "wheels, tires, ground rover, car" : "",
    mobility === "ground" && !hybrid ? "helicopter, hovering aircraft, airplane" : "",
    architecture === "electromagnetic linear propulsion" ? "pneumatic compressor, hydraulic pump, shop compressor" : "",
    architecture === "pneumatic linear propulsion" ? "electric motor catalog, hydraulic pump, multiple compressors" : "",
    architecture === "electrohydraulic linear propulsion" || architecture === "hydraulic linear propulsion" ? "pneumatic compressor, electric motor catalog" : "",
    architecture ? "turbine, jet engine, rotary motor, motorcycle, wheel, car, vehicle" : "",
    architecture === "integrated linear propulsion" ? "three different machines, comparison sheet, separate engines" : "",
    !specialized ? "diagram, schematic, instruction sheet, dimension lines, worksheet, research notes" : "",
    "people, hands, text, watermark",
    "loose parts, detached accessories, docking station, city, landscape, room",
  ].filter(Boolean).join(", "), 74);
  return { count, mobility, architecture, subject, prompt, negative };
}

export function designImageBrief(objective: string, title: string, parts: string[], summary = "") {
  const identity = compileDesignIdentity(objective, title, parts, summary);
  return { prompt: identity.prompt, negative: identity.negative };
}


/** One selected invention design drives both its picture request and parts panel.
 * Domain-neutral: it does not assume drones, vehicles, motors or any other
 * invention category. Every part and placement comes from the selected path.
 * Unverified pictures must never be described as engineering proof.
 */
export type SelectedDesignPart = { name: string; purpose: string; location: string };
export type SelectedPathwayDesign = DesignIdentity & {
  parts: SelectedDesignPart[];
  visibleAssemblies: string[];
};

/** Do not claim a hidden or separate component is visible on the assembly. */
function locatedOnExterior(part: SelectedDesignPart): boolean {
  const location=part.location;
  if (/\b(?:inside|internal|interior|hidden|embedded|enclosed|sealed|within)\b/i.test(location))
    return false;
  if (/\b(?:separate|remote|offsite|external station|detached|next to|beside the device)\b/i.test(location))
    return false;
  return /\b(?:front|rear|back|side|top|upper|lower|bottom|underside|underneath|outside|exterior|outer|surface|face|panel|mounted|attached|left|right|above|below|on the)\b/i.test(location);
}

function separateAccessory(part: SelectedDesignPart): boolean {
  return /\b(?:separate|remote|standalone|offsite|detached)\b/i.test(part.location)
    || (/\b(?:docking station|charging station|charging base)\b/i.test(part.name)
      && !/\b(?:integrated|built in|attached|mounted)\b/i.test(part.location));
}

export function compileSelectedPathwayDesign(
  objective: string,
  title: string,
  suppliedParts: readonly SelectedDesignPart[],
  summary = "",
  validateImageBudget = true,
): SelectedPathwayDesign {
  const parts=suppliedParts.filter(part=>Boolean(part) &&
    typeof part.name==="string" && part.name.trim().length>0 &&
    typeof part.purpose==="string" && typeof part.location==="string")
    .slice(0,12).map(part=>({
      name:part.name.slice(0,100),
      purpose:part.purpose.slice(0,360),
      location:part.location.slice(0,240),
    }));

  const base=compileDesignIdentity(objective,title,parts.map(p=>p.name),summary);
  // Preserve the selected pathway's name, not a guessed robot or vehicle type.
  const subject=titleSubject(title) || genericSubject(objective,title);
  const exterior=parts.filter(p=>!separateAccessory(p) && locatedOnExterior(p));
  // Keep short, truthful assembly constraints. Do not promote a component
  // into an additional product, or infer unprovided dimensions and materials.
  const visibleAssemblies=exterior.map(p=>p.name+" at "+p.location.replace(/\s+/g," ").trim().slice(0,58));
  const lead=base.count===3
    ? "Exactly three matching "+subject+" assemblies together"
    : "One complete assembled "+subject;
  // Every named exterior component must reach the image provider. The prior
  // slice(0,3) plus tail-truncation silently discarded owner-selected hardware.
  // A picture missing those constraints is not a picture of the selected design.
  // The pathway title and hardware do not necessarily carry the user's purpose.
  // Preserve the original request even when a generic title (e.g. Camera Drone)
  // was returned. Keep refinement metadata out of the image description.
  const originalObjective=(objective.split("\nBuild on the selected pathway:")[0] ?? objective)
    .replace(/\s+/g," ").trim();
  const purpose=originalObjective ? "Purpose: "+originalObjective : "";
  const required=[lead,purpose,"integrated components",...visibleAssemblies].filter(Boolean);
  const studio="neutral gray studio background";
  const requiredText=required.join(", ");
  if (validateImageBudget && clipTokenEstimate(requiredText)>68)
    throw new Error("The selected design has more visible component detail than the current image engine can represent faithfully. No incomplete invention picture was requested.");
  const prompt=clipTokenEstimate(requiredText+", "+studio)<=68
    ? requiredText+", "+studio : requiredText;
  const negative=bound([
    "collage, split screen, comparison sheet, multiple views, exploded view",
    base.count===1?"duplicate machine, second object, disconnected products":"",
    "floating loose parts, detached accessories, separate machines",
    "people, hands, text, watermark",
  ].filter(Boolean).join(", "),74);

  return {...base,subject,parts,visibleAssemblies,prompt,negative};
}

