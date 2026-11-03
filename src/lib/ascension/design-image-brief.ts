/** Preserve the selected architecture in the existing free image route. */
export function designImageBrief(objective: string, title: string, parts: string[], summary = "") {
  const selected=[title,summary,...parts].join(" ");
  const worker=/\b(?:worker|labor|labour)\b.*\b(?:drone|bot|robot)/i.test(objective);
  const ground=/ground-based|ground robot|wheeled|tracked|rover|wheels|tires/i.test(selected);
  const hybrid=/hybrid/i.test(title)&&ground&&/aerial|fly|flight|rotor/i.test(selected);
  const aerial=!ground&&/drone|aerial|multirotor|hexa|quad|flight|flying/i.test(selected+" "+objective);
  const swarm=/swarm|coordinated.*(?:fleet|drones)|multiple worker drones|central (?:control|controller)/i.test(title+" "+summary);
  const aircraft=/hexacopter|hexa|six.rotor/i.test(selected)?"hexacopter":/quadcopter|quad|four.rotor/i.test(selected)?"quadcopter":"multirotor";
  const unit=hybrid?"aerial-and-ground hybrid worker robot":aerial?"unmanned "+aircraft+" worker drone":ground?"ground worker robot":"worker robot";
  const subject=worker?(swarm?"Three matching "+unit+"s coordinated by one compact central controller":"One individual "+unit):"One complete "+title.slice(0,100);
  const visibleParts=parts.filter(part=>!(/software|cloud|algorithm|network/i.test(part))&&!(!swarm&&/station|dock|charging/i.test(part))).slice(0,3);

  return {
    prompt:[subject+".","One continuous studio product photograph, seamless dark neutral background, one camera angle.",aerial?"Landing skids and rotor propulsion.":"",swarm?"Identical drone designs arranged side by side next to a small central control console.":"Single assembled product, entire object visible.",visibleParts.join(", ")+".","Detailed mechanical construction, three-quarter view."].filter(Boolean).join(" "),
    negative:(aerial?"wheels, tires, wheeled chassis, car, ground rover, humanoid, android, biped, walking legs, cockpit, pilot, ":"")+"people, person, human, crowd, operator, bystander, face, hands, city, building, skyline, landscape, vegetation, scenery, outdoors, grass, field, trees, forest, sky, warehouse, collage, grid, montage, split panels, mosaic, contact sheet, pattern, text, watermark, diagram boxes"+(!swarm?", fleet, swarm, multiple objects":""),
  };
}
