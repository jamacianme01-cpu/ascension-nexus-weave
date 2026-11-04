/** Short SDXL reference-image brief for an existing selected pathway.
 * SDXL's CLIP encoders have bounded context: place the SUBJECT, count,
 * mobility, architecture and visible hardware first. Do not pass an essay.
 * Pictures remain unverified concepts, never engineering proof.
 */
export function designImageBrief(objective: string, title: string, parts: string[], summary = "") {
  const clean = (value: string, limit: number) => value.replace(/\s+/g, " ").trim().slice(0, limit);
  const selected = [title, summary, ...parts].join(" ");
  const worker = /\b(?:worker|labor|labour)\b.*\b(?:drone|bot|robot)/i.test(objective);
  const ground = /ground-based|ground robot|wheeled|tracked|rover|wheels|tires/i.test(selected);
  const hybrid = /\bhybrid\b/i.test(title) && ground && /aerial|fly|flight|rotor/i.test(selected);
  const aerial = !ground && /drone|aerial|multirotor|hexa|quad|flight|flying/i.test(selected + " " + objective);
  const swarm = /\b(?:swarm|fleet|formation|squadron)\b|\b(?:multiple|several|three|coordinated|team of)\s+(?:\w+\s+){0,2}(?:drones?|robots?|bots?)\b/i.test(title + " " + summary) &&
    /\b(?:drones?|robots?|bots?|aircraft|vehicles?)\b/i.test(title + " " + summary);
  const aircraft = /hexacopter|hexa|six.rotor/i.test(selected) ? "hexacopter" :
    /quadcopter|quad|four.rotor/i.test(selected) ? "quadcopter" : "multirotor";
  const unit = hybrid ? (worker ? "aerial-and-ground hybrid worker robot" : "aerial-and-ground hybrid robot") :
    aerial ? "unmanned " + aircraft + (worker ? " worker drone" : " drone") :
    ground ? (worker ? "ground worker robot" : "ground robot") : (worker ? "worker robot" : "robot");
  const subject = swarm ? "Three matching " + unit + "s coordinated by one compact central controller" :
    worker ? "One individual " + unit : "One complete " + clean(title, 80);
  // Named components are integral features, NOT additional isolated products.
  const visibleParts = parts.map(p => clean(p, 44))
    .filter(p => p && !/software|cloud|algorithm|network|firmware|database|web app/i.test(p))
    .filter(p => !(worker || aerial || ground) || !/station|dock|charging pedestal|charging base/i.test(p))
    .slice(0, 2);
  const design = clean(summary, 120);
  const brief = [
    subject + ".",
    swarm ? "Exactly three identical assembled units, one camera view." :
      "Exactly ONE complete assembled machine, one camera view.",
    clean(title, 75) + (design ? ": " + design : "") + ".",
    visibleParts.length ? "Integrate " + visibleParts.join(" and ") + " into the same assembly." : "",
    aerial ? "Rotor propulsion, no wheels." :
      ground && !hybrid ? "Ground mobility, no flying drone." : "",
    "Single three-quarter studio product render, plain gray background.",
  ].filter(Boolean).join(" ");
  // Restrict length for the model's bounded text encoder; preserve the
  // subject/count by truncating only the lower-priority tail.
  const words = brief.split(/\s+/);
  const prompt = words.slice(0, 64).join(" ");
  const negative = [
    "collage, split panels, multiple viewpoints, duplicate products, stacked drones",
    swarm ? "unmatched drones, mixed aircraft, extra controllers" :
      "extra machine, duplicate robot, second drone, fleet, swarm",
    aerial ? "wheels, tires, ground rover" : "",
    ground && !hybrid ? "helicopter, hovering aircraft" : "",
    "loose parts, detached accessories, docking station, people, city, landscape, text, watermark",
  ].filter(Boolean).join(", ");
  return { prompt, negative };
}
