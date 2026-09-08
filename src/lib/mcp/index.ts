import { auth, defineMcp } from "@lovable.dev/mcp-js";
import chamberTool from "./tools/chamber";
import knowledgeverseTool from "./tools/knowledgeverse";
import pathwaysTool from "./tools/pathways";
import governanceTool from "./tools/governance";
import ledgerTool from "./tools/ledger";
import libraryCardTool from "./tools/library-card";
import executeTool from "./tools/execute";
import runStatusTool from "./tools/run-status";

// The OAuth issuer must be the direct Supabase auth host: the published runtime
// URL is proxied and would fail the RFC 8414 issuer match.
const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "ascension-weaver",
  title: "Ascension Weaver",
  version: "0.1.0",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  instructions:
    "Observation and objective-intake tools for the ASCENSION console. Callers must sign in as an operator of this app. The observation tools (ascension_chamber, ascension_knowledgeverse, ascension_pathways, ascension_governance, ascension_ledger, ascension_library_card) return bundled published DEMO state with a source_classification field. ascension_execute submits an objective to the operator's governed runtime queue and ascension_run_status reports the run; neither executes the cycle here. Nothing in this layer can write to or reinterpret the governed ASCENSION core (Knowledgeverse runtime, DTF, Galaxy Bridge, Guardian, AutoSync, ID/SID, Meaning Elements, Verified Δ, Unreal, CAD) — decomposition, branching, evaluation, Guardian, selection, execution, AutoSync verification, Δ and persistence all happen inside the governed core. Absent fields are absent, never inferred. Start with ascension_chamber for Destiny and current state; to give ASCENSION work, call ascension_execute then poll ascension_run_status with the returned request_id.",
  tools: [
    chamberTool,
    knowledgeverseTool,
    pathwaysTool,
    governanceTool,
    ledgerTool,
    libraryCardTool,
    executeTool,
    runStatusTool,
  ],
});
