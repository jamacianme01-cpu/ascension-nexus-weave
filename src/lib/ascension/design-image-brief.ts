/** Keep the selected pathway's identity and actual architecture in the approved free image route.
 * A generated image is still an unverified concept, never a technical assembly receipt.
 */
export function designImageBrief(objective: string, title: string, parts: string[], summary = "") {
  const clean = (value: string, max: number) => value.replace(/\s+/g, " ").trim().slice(0, max);
  const selected = [title, summary, ...parts].join(" ");
  const worker = /\b(?:worker|labor|labour)\b.*\b(?:drone|bot|robot)/i.test(objective);
  const ground = /ground-based|ground robot|wheeled|tracked|rover|wheels|tires/i.test(selected);
  const hybrid = /\bhybrid\b/i.test(title) && ground && /aerial|fly|flight|rotor/i.test(selected);
  const aerial = !ground && /drone|aerial|multirotor|hexa|quad|flight|flying/i.test(selected + " " + objective);
  // A 'central controller' may be a component of ONE aircraft. It does not
  // imply a swarm. Require explicit multi-vehicle/team language.
  const swarm = /\b(?:swarm|fleet|formation|squadron)\b|\b(?:multiple|several|three|coordinated|team of)\s+(?:\w+\s+){0,2}(?:drones?|robots?|bots?)\b/i.test(title + " " + summary);
  const aircraft = /hexacopter|hexa|six.rotor/i.test(selected) ? "hexacopter" :
    /quadcopter|quad|four.rotor/i.test(selected) ? "quadcopter" : "multirotor";
  const unit = hybrid ? "aerial-and-ground hybrid worker robot" :
    aerial ? "unmanned " + aircraft + " worker drone" :
    ground ? "ground worker robot" : "worker robot";
  const subject = worker
    ? (swarm ? "Three matching " + unit + "s coordinated by one compact central controller" : "One individual " + unit)
    : "One complete " + clean(title, 100);

  // Hardware names are structural constraints, not separate products to lay
  // beside the design. Internal electronics need not be visible.
  const visibleParts = parts
    .map(part => clean(part, 100))
    .filter(part => part && !/software|cloud|algorithm|network|firmware|subscription|database|web app/i.test(part))
    .filter(part => swarm || !/station|dock|charging pedestal|charging base/i.test(part))
    .slice(0, 7);
  const selectedSummary = clean(summary, 650);
  const prompt = [
    subject + ".",
    "SELECTED DESIGN: " + clean(title, 140) + ". " + selectedSummary,
    swarm
      ? "Exactly three IDENTICAL complete units of this one selected model, arranged as a coherent matched team in one studio scene, with one compact central controller. Do not mix models, camera angles, or separate product illustrations."
      : "Exactly ONE complete assembled machine. One chassis, one consistent physical design and one perspective. Do not duplicate the machine, stack different models or show alternate versions.",
    hybrid
      ? "Both rotors and ground-drive hardware must belong to the SAME integrated hybrid machine."
      : aerial
        ? "Rotor propulsion and landing supports are part of the SAME aircraft; no wheels, ground rover or second drone."
        : ground
          ? "The selected ground mobility hardware is built into the robot; no aircraft or floating rotorcraft."
          : "",
    visibleParts.length
      ? "Integrate these selected design components into the SAME assembly wherever externally visible: " + visibleParts.join("; ") + ". Internal electronics remain within the chassis, not isolated props, product boxes or accessories."
      : "",
    "A single uninterrupted product-design render, three-quarter camera view, centered with the entire assembly visible. Plain neutral studio background, soft even lighting.",
    "Depict the stated physical architecture and intended purpose, not a stock generic drone. No people, environment, multiple camera views, exploded components, cutaways, diagrams, labels, overlays or collage.",
  ].filter(Boolean).join(" ");
  const negative = [
    aerial ? "wheels, tires, wheeled chassis, car, ground rover, humanoid, android, biped, walking legs, cockpit, pilot" : "",
    ground && !hybrid ? "airplane, flying drone, rotorcraft, hovering, helicopter" : "",
    "people, person, human, crowd, operator, bystander, face, hands, city, building, skyline, landscape, vegetation, scenery, outdoors, grass, field, trees, forest, sky, warehouse",
    "collage, grid, montage, split panels, mosaic, contact sheet, diptych, triptych, multiple angles, multiple viewpoints, before and after, side by side views, stacked drones, overlapping vehicles",
    "loose accessories, detached components, spare parts, floating pieces, product catalog, exploded view, boxed devices, unrelated products, text, watermark, diagram boxes",
    swarm ? "mixed aircraft types, unmatched drones, nonidentical fleet, multiple controllers" :
      "fleet, swarm, two drones, three drones, duplicate robot, extra machine, multiple objects",
  ].filter(Boolean).join(", ");
  return { prompt, negative };
}
