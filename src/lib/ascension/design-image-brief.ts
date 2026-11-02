/** Short subject-first prompts for the existing product-image generator.
 * Workflow/system prose must not turn a component preview into a city or fleet.
 */
export function designImageBrief(objective: string, title: string, parts: string[]) {
  const worker = /\b(worker|labor|labour)\b.*\b(drone|bot|robot)/i.test(objective);
  const mobileParts = parts.filter(part => !/station|dock|charging|network|software|fleet|cloud|base station/i.test(part)).slice(0, 3);
  const workerSubject = /aerial|multirotor|hexa|quad|flight|flying/i.test(title)
    ? "One individual unmanned multirotor worker drone" : /ground|wheel|track|rover/i.test(title)
    ? "One individual ground worker robot" : "One individual unmanned worker robot";
  const subject = worker ? workerSubject : "One complete " + title.slice(0, 100);
  const designTitle = worker ? title.replace(/\b(fleet|swarm|systems?|network|infrastructure)\b/gi, "").replace(/\s+/g, " ").trim() : title;
  return {
    prompt: [subject + ".", designTitle.slice(0, 110) + ".", mobileParts.join(", ") + ".",
      "Single assembled product, entire object visible, three-quarter view, plain studio background, detailed mechanical construction."].join(" "),
    negative: (/aerial|multirotor|hexa|quad|flight|flying/i.test(title) ? "humanoid, android, biped, cockpit, pilot, " : "") + "people, person, human, man, woman, child, crowd, operator, bystander, face, hands, city, building, skyline, architecture, landscape, vegetation, scenery, warehouse, fleet, swarm, multiple objects, collage, contact sheet, pattern, text, watermark, diagram boxes",
  };
}
