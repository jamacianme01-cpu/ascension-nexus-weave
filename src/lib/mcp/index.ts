import { defineMcp } from "@lovable.dev/mcp-js";
import chamberTool from "./tools/chamber";
import knowledgeverseTool from "./tools/knowledgeverse";
import pathwaysTool from "./tools/pathways";
import governanceTool from "./tools/governance";
import ledgerTool from "./tools/ledger";
import libraryCardTool from "./tools/library-card";

export default defineMcp({
  name: "ascension-weaver",
  title: "Ascension Weaver",
  version: "0.1.0",
  instructions:
    "Read-only observation tools for the ASCENSION console. Every tool returns bundled published DEMO state with a source_classification field; none of them can write to or reinterpret the governed ASCENSION core (Knowledgeverse runtime, DTF, Galaxy Bridge, Guardian, AutoSync, ID/SID, Meaning Elements, Verified Δ, Unreal, CAD). Absent fields are absent, never inferred. Start with ascension_chamber for Destiny and current state, then ascension_knowledgeverse, ascension_pathways, ascension_governance, ascension_ledger, and ascension_library_card for a single entity.",
  tools: [
    chamberTool,
    knowledgeverseTool,
    pathwaysTool,
    governanceTool,
    ledgerTool,
    libraryCardTool,
  ],
});
