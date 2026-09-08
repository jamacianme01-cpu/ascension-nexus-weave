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
    "Read-only observation tools for the ASCENSION console. Callers must sign in as a user of this app. Every tool returns bundled published DEMO state with a source_classification field; none of them can write to or reinterpret the governed ASCENSION core (Knowledgeverse runtime, DTF, Galaxy Bridge, Guardian, AutoSync, ID/SID, Meaning Elements, Verified Δ, Unreal, CAD). Absent fields are absent, never inferred. Start with ascension_chamber for Destiny and current state, then ascension_knowledgeverse, ascension_pathways, ascension_governance, ascension_ledger, and ascension_library_card for a single entity.",
  tools: [
    chamberTool,
    knowledgeverseTool,
    pathwaysTool,
    governanceTool,
    ledgerTool,
    libraryCardTool,
  ],
});
