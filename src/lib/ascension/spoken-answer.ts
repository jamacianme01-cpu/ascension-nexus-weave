/** Bound spoken turns without leaving a paragraph or a cut-off word. */
export type VoiceCommand =
  | { kind: "section"; section: "business" | "build" | "guidance" }
  | { kind: "engage" }
  | { kind: "next" }
  | { kind: "previous" }
  | { kind: "hear"; target: number | "blend" | "active" }
  | { kind: "enter" }
  | { kind: "back" }
  | { kind: "new-objective" }
  | { kind: "view"; view: "blueprint" | "dissect" | "exploded" | "assembled" | "picture" }
  | { kind: "retry-picture" }
  | { kind: "zoom"; direction: "in" | "out" }
  | { kind: "rotate"; direction: "left" | "right" }
  | { kind: "reset-view" }
  | { kind: "camera"; view: "perspective" | "front" | "back" | "left" | "right" | "top" }
  | { kind: "move"; direction: "left" | "right" | "up" | "down" }
  | { kind: "part"; name: string };

const ORDINALS: Record<string, number> = {
  first: 0, one: 0, "1": 0,
  second: 1, two: 1, "2": 1,
  third: 2, three: 2, "3": 2,
  fourth: 3, four: 3, "4": 3,
};

/** Spoken app commands. A question or a long sentence stays a Tree question. */
export function interpretVoiceCommand(transcript: string): VoiceCommand | null {
  const text = transcript.toLowerCase().replace(/[?.!,]/g, " ").replace(/\s+/g, " ").trim();
  if (!text || text.split(" ").length > 8) return null;
  if (/^(what|why|how|when|who|where|which|can|could|would|should)\b/.test(text)) return null;
  const exact = (pattern: RegExp, command: VoiceCommand) => pattern.test(text) ? command : null;
  return exact(/^(?:business planner|business)$/, { kind: "section", section: "business" })
    ?? exact(/^(?:build(?: \/ create)?|create|build create)$/, { kind: "section", section: "build" })
    ?? exact(/^guidance$/, { kind: "section", section: "guidance" })
    ?? exact(/^(?:engage|engage ascension)$/, { kind: "engage" })
    ?? exact(/^(?:next|next pathway|next orb)$/, { kind: "next" })
    ?? exact(/^(?:previous|previous pathway|previous orb|last orb)$/, { kind: "previous" })
    ?? exact(/^(?:enter|enter pathway|open pathway|go inside|go in)$/, { kind: "enter" })
    ?? exact(/^(?:back|go back|back to pathways)$/, { kind: "back" })
    ?? exact(/^(?:new objective|start over)$/, { kind: "new-objective" })
    ?? exact(/^(?:blueprint|show blueprint|open blueprint)$/, { kind: "view", view: "blueprint" })
    ?? exact(/^(?:dissect|dissect it|open dissect|show dissect)$/, { kind: "view", view: "dissect" })
    ?? exact(/^(?:exploded|explode|exploded view|open exploded)$/, { kind: "view", view: "exploded" })
    ?? exact(/^(?:implode|imploded|assembled|assemble)$/, { kind: "view", view: "assembled" })
    ?? exact(/^(?:picture|show picture|open picture|show the picture|open the picture)$/, { kind: "view", view: "picture" })
    ?? exact(/^(?:try again|try the picture|try this picture again|retry picture)$/, { kind: "retry-picture" })
    ?? exact(/^zoom in$/, { kind: "zoom", direction: "in" })
    ?? exact(/^zoom out$/, { kind: "zoom", direction: "out" })
    ?? exact(/^rotate left$/, { kind: "rotate", direction: "left" })
    ?? exact(/^rotate right$/, { kind: "rotate", direction: "right" })
    ?? exact(/^(?:reset|reset view)$/, { kind: "reset-view" })
    ?? exact(/^(?:perspective|perspective view)$/, { kind: "camera", view: "perspective" })
    ?? exact(/^(?:front|front view)$/, { kind: "camera", view: "front" })
    ?? exact(/^(?:back view)$/, { kind: "camera", view: "back" })
    ?? exact(/^(?:left view|view left)$/, { kind: "camera", view: "left" })
    ?? exact(/^(?:right view|view right)$/, { kind: "camera", view: "right" })
    ?? exact(/^(?:top|top view)$/, { kind: "camera", view: "top" })
    ?? exact(/^move left$/, { kind: "move", direction: "left" })
    ?? exact(/^move right$/, { kind: "move", direction: "right" })
    ?? exact(/^move up$/, { kind: "move", direction: "up" })
    ?? exact(/^move down$/, { kind: "move", direction: "down" })
    ?? hearCommand(text)
    ?? partCommand(text);
}

function hearCommand(text: string): VoiceCommand | null {
  if (/^(?:hear|hear this|hear again|hear this orb)$/.test(text)) return { kind: "hear", target: "active" };
  if (/^(?:open blend|hear blend|blend|select blend|choose blend)$/.test(text)) return { kind: "hear", target: "blend" };
  const words = text.replace(/^(?:hear|open|select|choose)\s+/, "").replace(/\b(?:the|pathway|orb)\b/g, " ").replace(/\s+/g, " ").trim();
  if (!words || !(words in ORDINALS)) return null;
  return { kind: "hear", target: ORDINALS[words]! };
}

function partCommand(text: string): VoiceCommand | null {
  const match = text.match(/^(?:select|show part|open part) (.+)$/);
  const name = match?.[1]?.replace(/^the\s+/, "").trim() ?? "";
  if (name.length < 2 || /^(?:pathway|orb|blend|picture|blueprint)$/.test(name)) return null;
  return { kind: "part", name };
}

export function voiceCommandSpeech(command: VoiceCommand): string {
  const line = command.kind === "section" ? "Opening " + command.section + "."
    : command.kind === "engage" ? "Engaging ASCENSION."
    : command.kind === "next" ? "Next pathway."
    : command.kind === "previous" ? "Previous pathway."
    : command.kind === "hear" ? "Hearing that pathway."
    : command.kind === "enter" ? "Entering the pathway."
    : command.kind === "back" ? "Back to the pathways."
    : command.kind === "new-objective" ? "Starting a new objective."
    : command.kind === "view" ? "Opening the " + command.view + " view."
    : command.kind === "retry-picture" ? "Trying the picture again."
    : command.kind === "zoom" ? "Zooming " + command.direction + "."
    : command.kind === "rotate" ? "Rotating " + command.direction + "."
    : command.kind === "reset-view" ? "Resetting the view."
    : command.kind === "camera" ? "Showing the " + command.view + " view."
    : command.kind === "move" ? "Moving the part " + command.direction + "."
    : "Selecting " + command.name + ".";
  return briefSpokenAnswer(line, 12);
}

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
