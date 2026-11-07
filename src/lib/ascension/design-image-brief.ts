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


/** One selected pathway is the source of both the displayed parts list and the
 * assembled-picture request. No extra components or dimensions are invented.
 * Only externally visible, attached assemblies are described to the raster
 * generator. Internal parts remain listed but cannot be called visible.
 * A raster result remains an unverified concept even with this conditioning.
 */
export type SelectedDesignPart = { name: string; purpose: string; location: string };
export type SelectedPathwayDesign = DesignIdentity & {
  parts: SelectedDesignPart[];
  rotorCount: 4 | 6 | 8 | null;
  visibleAssemblies: string[];
};

function rotorTopology(text: string): 4 | 6 | 8 | null {
  if (/\b(?:octocopter|octa(?:copter|rotor)|eight[- ]rotor|8[- ]rotor)\b/i.test(text)) return 8;
  if (/\b(?:hexacopter|hexa(?:copter|rotor)|six[- ]rotor|6[- ]rotor)\b/i.test(text)) return 6;
  if (/\b(?:quadcopter|quad(?:copter|rotor)|four[- ]rotor|4[- ]rotor)\b/i.test(text)) return 4;
  return null;
}

export function compileSelectedPathwayDesign(
  objective: string,
  title: string,
  suppliedParts: readonly SelectedDesignPart[],
  summary = "",
): SelectedPathwayDesign {
  // Keep the provider's exact selected part names, functions and locations.
  const parts = suppliedParts.filter(part => Boolean(part) &&
    typeof part.name === "string" && part.name.trim().length > 0 &&
    typeof part.purpose === "string" && typeof part.location === "string")
    .slice(0, 12).map(part => ({
      name: part.name.slice(0, 100),
      purpose: part.purpose.slice(0, 360),
      location: part.location.slice(0, 240),
    }));
  const base = compileDesignIdentity(objective, title, parts.map(part => part.name), summary);
  const fixedWing = /\b(?:fixed[- ]wing|fixed wing|glider|winged aircraft)\b/i.test(title) ||
    (/\b(?:fixed[- ]wing|fixed wing)\b/i.test(summary) && !/\b(?:rotorcraft|quadcopter|hexacopter)\b/i.test(title));
  const walking = /\b(?:hexapod|walking robot|walking drone|six[- ]legged)\b/i.test(title) ||
    (/\b(?:hexapod|six[- ]legged)\b/i.test(summary) && !/\b(?:quadcopter|hexacopter)\b/i.test(title));
  const rotorCount = fixedWing || walking ? null : rotorTopology(title) ?? rotorTopology(summary);
  const isDrone = /\b(?:drone|aerial|unmanned|aircraft|rotor|quadcopter|hexacopter|octocopter)\b/i
    .test(title + " " + summary);
  const subject = fixedWing ? "fixed-wing unmanned drone" :
    walking ? "six-legged walking ground robot" :
    rotorCount === 8 ? "octocopter drone" :
    rotorCount === 6 ? "hexacopter drone" :
    rotorCount === 4 ? "quadcopter drone" : base.subject;
  const visibleAssemblies: string[] = [];
  if (fixedWing) visibleAssemblies.push("two rigid wings joined to one fuselage");
  else if (walking) visibleAssemblies.push("six articulated legs attached to one chassis");
  else if (rotorCount) visibleAssemblies.push("exactly " + rotorCount + " rotor units attached to one central airframe");
  else if (isDrone && base.mobility === "aerial") visibleAssemblies.push("rotors attached to one central airframe");

  // Integrate only explicitly selected, physically attached visible components.
  // Never turn a charging base, battery, gas sensor or radio module into an
  // unrelated second product just because it appears in the parts list.
  const external = parts.filter(part => !/\b(?:docking|charging station|base station|charger)\b/i.test(part.name));
  const camera = external.find(part => /\b(?:camera|imaging camera|vision camera)\b/i.test(part.name));
  const grip = external.find(part => /\b(?:gripper|manipulator|robotic arm|claw)\b/i.test(part.name));
  const legs = external.find(part => /\b(?:landing gear|landing leg|landing skid|terrain[- ]assist leg)\b/i.test(part.name));
  if (camera) {
    const rear = /\b(?:rear|back|tail)\b/i.test(camera.location);
    const top = /\b(?:top|upper|roof)\b/i.test(camera.location);
    visibleAssemblies.push((rear ? "rear" : top ? "top" : /\b(?:front|nose|forward)\b/i.test(camera.location) ? "front" : "body") +
      "-mounted camera built into the same " + (walking ? "chassis" : "fuselage"));
  }
  if (grip) {
    const under = /\b(?:underside|underbody|bottom|underneath|belly|below)\b/i.test(grip.location);
    visibleAssemblies.push((under ? "underbody " : "") + "robotic gripper attached to the same " +
      (walking ? "chassis" : "fuselage"));
  }
  if (legs && !walking) visibleAssemblies.push("landing legs attached below the same airframe");

  const head = base.count === 3
    ? "Exactly three identical " + subject + "s in one group, single photograph"
    : "One single " + subject + ", one complete assembled machine, single photograph";
  // Retain the dominant shape and at most two secondary visible subassemblies
  // within SDXL's short text-encoder budget.
  const shape = visibleAssemblies.slice(0, 3);
  const prompt = bound([head, ...shape, "plain gray studio background"].join(", "), 68);
  const negative = bound([
    base.negative,
    fixedWing ? "multirotor helicopter, extra propeller assemblies" : "",
    walking ? "flying helicopter, propeller aircraft" : "",
    rotorCount ? "wrong rotor count, extra rotors, stacked airframes" : "",
    "floating loose accessories, detached camera, separate gripper",
  ].filter(Boolean).join(", "), 74);
  return { ...base, subject, rotorCount, parts, visibleAssemblies, prompt, negative };
}
