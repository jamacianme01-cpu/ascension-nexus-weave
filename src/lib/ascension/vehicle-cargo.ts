/**
 * When a design names a vehicle, fetch that vehicle's published cargo
 * measurements and compare them with the enclosure the person described.
 * Missing publications stay unresolved. Nothing here is a physical measurement
 * of the person's vehicle.
 */

export type CargoMeasure = {
  key: string;
  label: string;
  inches: number | null;
  status: "sourced" | "not_published" | "not_found";
};

export type VehicleCargo = {
  vehicle: string;
  year: number;
  lookup: "ok" | "failed";
  error: string | null;
  source_url: string | null;
  measures: CargoMeasure[];
  seat_fold: string | null;
  pass_through: string;
  subwoofer_fitment: string;
  enclosure: {
    driver_inches: number | null;
    driver_name: string | null;
    impedance_ohms: number | null;
    amp_watts: number | null;
    amp_name: string | null;
    port_count: number | null;
    port_diameter_inches: number | null;
    port_length_inches: number | null;
    port_direction: string | null;
  };
  constraints: string[];
};

const COUNT: Record<string, number> = { one: 1, two: 2, three: 3, four: 4 };

export function namedVehicle(objective: string): { year: number; make: string; model: string } | null {
  const match = objective.match(/\b((?:19|20)\d{2})\s+([A-Za-z][A-Za-z]+)\s+([A-Za-z0-9][A-Za-z0-9-]*)\b/);
  if (!match) return null;
  return { year: Number(match[1]), make: match[2]!, model: match[3]! };
}

function countWord(value: string): number | null {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  return COUNT[value.toLowerCase()] ?? null;
}

export function describedEnclosure(objective: string): VehicleCargo["enclosure"] {
  const driver = objective.match(/(\d+(?:\.\d+)?)\s*-?\s*inch\s+([A-Za-z0-9]+)?\s*sub/i);
  const ohms = objective.match(/(\d+(?:\.\d+)?)\s*ohm/i);
  const amp = objective.match(/(\d+)\s*watt\s+(.+?)\s+amplif/i);
  const ports = objective.match(/(\d+|one|two|three|four)\s+(\d+(?:\.\d+)?)\s*-?\s*inch\s+ports?\s+(\d+(?:\.\d+)?)\s+inches?\s+long(?:\s+firing\s+([a-z]+))?/i);
  return {
    driver_inches: driver ? Number(driver[1]) : null,
    driver_name: driver?.[2] ? driver[2] : null,
    impedance_ohms: ohms ? Number(ohms[1]) : null,
    amp_watts: amp ? Number(amp[1]) : null,
    amp_name: amp?.[2] ? amp[2].trim().slice(0, 80) : null,
    port_count: ports ? countWord(ports[1]!) : null,
    port_diameter_inches: ports ? Number(ports[2]) : null,
    port_length_inches: ports ? Number(ports[3]) : null,
    port_direction: ports?.[4] ? ports[4].toLowerCase() : null,
  };
}

export function stripSpecPage(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&#160;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function readInches(text: string, label: string): { inches: number | null; status: CargoMeasure["status"] } {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(escaped + "\\s*\\(inches\\)\\s*(NA|N/A|—|-|\\d+(?:\\.\\d+)?)", "i"));
  if (!match) return { inches: null, status: "not_found" };
  if (/^(?:na|n\/a|—|-)$/i.test(match[1]!)) return { inches: null, status: "not_published" };
  return { inches: Number(match[1]), status: "sourced" };
}

export function cargoFromSpecText(text: string, vehicle: { year: number; make: string; model: string }, objective: string, sourceUrl: string | null): VehicleCargo {
  const lengthFolded = readInches(text, "Cargo Space/Area Length Behind First Row");
  const betweenWells = readInches(text, "Cargo Bed Width Between Wheelhousings");
  const beltline = readInches(text, "Cargo Space/Area Width at Beltline");
  const bedHeight = readInches(text, "Cargo Bed Height");
  const openingHeight = readInches(text, "Rear Door Opening Height");
  const openingWidth = readInches(text, "Rear Door Opening Width");
  const hatchAngle = text.match(/(?:hatch|liftgate)[^.]{0,60}?(\d+(?:\.\d+)?)\s*(?:degrees|°)/i);
  const fold = text.match(/60\s*\/\s*40[^.]{0,90}/i);
  const pass = text.match(/pass[- ]through[^.]{0,90}/i);
  const sub = text.match(/subwoofer[^.]{0,90}/i);
  const enclosure = describedEnclosure(objective);
  const measures: CargoMeasure[] = [
    { key: "length_seats_folded", label: "Maximum cargo length with rear seats folded", ...lengthFolded },
    { key: "width_between_wells", label: "Cargo width between wheel wells", ...betweenWells },
    { key: "floor_width", label: "Cargo floor width at the narrowest published point", inches: betweenWells.inches ?? beltline.inches, status: betweenWells.status === "sourced" ? "sourced" : beltline.status },
    { key: "cargo_height", label: "Cargo height", ...bedHeight },
    { key: "hatch_angle", label: "Rear hatch opening angle", inches: null, status: hatchAngle ? "sourced" : "not_found" },
    { key: "opening_width", label: "Rear opening width", ...openingWidth },
    { key: "opening_height", label: "Rear opening height", ...openingHeight },
    { key: "beltline_width", label: "Cargo width at the beltline", ...beltline },
  ];
  if (hatchAngle) measures.find((item) => item.key === "hatch_angle")!.inches = Number(hatchAngle[1]);
  const constraints = fitment(measures, enclosure);
  return {
    vehicle: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
    year: vehicle.year,
    lookup: "ok",
    error: null,
    source_url: sourceUrl,
    measures,
    seat_fold: fold ? fold[0].trim() : null,
    pass_through: pass ? pass[0].trim() : "No rear-seat pass-through size was published on the spec page.",
    subwoofer_fitment: sub ? sub[0].trim() : "No subwoofer-specific location or enclosure size was published on the spec page.",
    enclosure,
    constraints,
  };
}

function fitment(measures: CargoMeasure[], enclosure: VehicleCargo["enclosure"]): string[] {
  const lines: string[] = [];
  const wells = measures.find((item) => item.key === "width_between_wells");
  const height = measures.find((item) => item.key === "cargo_height");
  const length = measures.find((item) => item.key === "length_seats_folded");
  const angle = measures.find((item) => item.key === "hatch_angle");
  if (wells?.status === "sourced" && wells.inches != null) {
    lines.push(`The box width has to stay within ${wells.inches} inches between the wheel wells.`);
    if (enclosure.driver_inches != null) {
      lines.push(enclosure.driver_inches < wells.inches
        ? `The ${enclosure.driver_inches}-inch driver is narrower than that ${wells.inches}-inch gap, so the driver itself fits between the wells. The finished shell, including walls, still has to stay inside ${wells.inches} inches.`
        : `The ${enclosure.driver_inches}-inch driver is wider than the ${wells.inches}-inch gap between the wells, so it does not fit between them.`);
    }
  } else lines.push("Width between the wheel wells was not published, so the box width is not limited by a sourced cargo width.");
  if (enclosure.port_count && enclosure.port_diameter_inches && enclosure.port_length_inches) {
    const direction = enclosure.port_direction ? ` firing ${enclosure.port_direction}` : "";
    lines.push(`The request uses ${enclosure.port_count} ports, ${enclosure.port_diameter_inches} inches across and ${enclosure.port_length_inches} inches long${direction}.`);
  }
  if (height?.status !== "sourced") {
    lines.push(enclosure.port_direction === "upward" || enclosure.port_direction === "up"
      ? "Cargo height was not published, so an upward port cannot be checked against the ceiling. That clearance stays unresolved."
      : "Cargo height was not published, so vertical clearance stays unresolved.");
  } else if (enclosure.port_length_inches != null && height.inches != null && enclosure.port_direction === "upward") {
    lines.push(enclosure.port_length_inches < height.inches
      ? `The ${enclosure.port_length_inches}-inch upward port is shorter than the published cargo height of ${height.inches} inches. Walls and the hatch slope are still not included in that comparison.`
      : `The ${enclosure.port_length_inches}-inch upward port is longer than the published cargo height of ${height.inches} inches, so a straight upward port does not fit.`);
  }
  lines.push(length?.status === "sourced" && length.inches != null
    ? `Maximum cargo length with the rear seats folded is ${length.inches} inches, so the box depth along the vehicle has to stay inside that.`
    : "Maximum cargo length with the rear seats folded was not published, so box depth along the vehicle stays unresolved.");
  lines.push(angle?.status === "sourced" && angle.inches != null
    ? `The published rear hatch opening angle is ${angle.inches} degrees.`
    : "The rear hatch opening angle was not published, so slope clearance stays unresolved.");
  if (enclosure.amp_watts || enclosure.impedance_ohms) {
    lines.push(`The stated electrical load is ${enclosure.amp_watts ?? "an unstated"} watts at ${enclosure.impedance_ohms ?? "an unstated"} ohms${enclosure.amp_name ? ` on the ${enclosure.amp_name}` : ""}. The spec page does not give that amplifier a cargo size, and no amplifier dimensions were in the request, so amplifier fitment stays unresolved.`);
  }
  return lines;
}

/** Text the design route can place in the brief. Sourced inches stay sourced; gaps stay unresolved. */
export function cargoDesignBrief(cargo: VehicleCargo): string {
  const measures = cargo.measures.map((item) => {
    if (item.status !== "sourced" || item.inches == null) return `${item.label}: ${item.status.replace(/_/g, " ")}`;
    const unit = item.key === "hatch_angle" ? "degrees" : "inches";
    return `${item.label}: ${item.inches} ${unit}`;
  }).join("; ");
  return [
    `PUBLISHED CARGO SPECS for ${cargo.vehicle}. Lookup ${cargo.lookup}. These are published figures, not a measurement of the person's own vehicle.`,
    cargo.error ? `Lookup note: ${cargo.error}` : "",
    `Measures: ${measures}.`,
    `Fitment: ${cargo.constraints.join(" ")}`,
    cargo.seat_fold ? `Seat fold: ${cargo.seat_fold}` : "",
    cargo.pass_through,
    cargo.subwoofer_fitment,
    "Size the enclosure inside the sourced limits. Do not invent a cargo dimension marked not published or not found. Call those unresolved and still state the enclosure choice.",
  ].filter(Boolean).join("\n");
}

export function specPageUrl(vehicle: { year: number; make: string; model: string }): string {
  const make = vehicle.make.toLowerCase();
  const model = vehicle.model.toLowerCase();
  return `https://www.caranddriver.com/${make}/${model}/specs/${vehicle.year}/${make}_${model}_${make}-${model}_${vehicle.year}`;
}

export async function lookupVehicleCargo(objective: string, fetchImpl: typeof fetch = fetch): Promise<VehicleCargo | null> {
  const vehicle = namedVehicle(objective);
  if (!vehicle) return null;
  const url = specPageUrl(vehicle);
  try {
    const response = await fetchImpl(url, {
      signal: AbortSignal.timeout(15000),
      headers: { "user-agent": "ASCENSION vehicle-cargo lookup", accept: "text/html" },
    });
    if (!response.ok) {
      return failed(vehicle, url, "Spec page returned HTTP " + response.status + ".");
    }
    const html = await response.text();
    if (html.length < 1000 || !/cargo/i.test(html)) {
      return failed(vehicle, url, "Spec page did not include a cargo section.");
    }
    return cargoFromSpecText(stripSpecPage(html), vehicle, objective, url);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return failed(vehicle, url, message);
  }
}

function failed(vehicle: { year: number; make: string; model: string }, url: string, message: string): VehicleCargo {
  const empty = cargoFromSpecText("", vehicle, "", null);
  return { ...empty, lookup: "failed", error: message.slice(0, 300), source_url: url, constraints: ["Vehicle cargo specs could not be fetched. No dimensions were invented."] };
}
