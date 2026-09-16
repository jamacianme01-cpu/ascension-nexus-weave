import { auth, defineMcp } from "@lovable.dev/mcp-js";
import chamberTool from "./tools/chamber";
import knowledgeverseTool from "./tools/knowledgeverse";
import pathwaysTool from "./tools/pathways";
import governanceTool from "./tools/governance";
import ledgerTool from "./tools/ledger";
import libraryCardTool from "./tools/library-card";
import executeTool from "./tools/execute";
import codeWalkerTool from "./tools/code-walker";
import runStatusTool from "./tools/run-status";

// The OAuth issuer must be the direct Supabase auth host: the published runtime
// URL is proxied and would fail the RFC 8414 issuer match.
const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "ascension-weaver",
  title: "Ascension Weaver",
  version: "0.2.0",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
    // Request offline_access so Supabase issues a refresh token to the MCP
    // client. Without it, ChatGPT's connector fails with
    // run_with_credentials_failed_token_refresh_not_supported once the
    // initial access token expires.
    requiredScopes: ["offline_access"],
  }),
  instructions:
    "Observation and objective-intake tools for the ASCENSION console. Callers must sign in as an operator of this app. The observation tools (ascension_chamber, ascension_knowledgeverse, ascension_pathways, ascension_governance, ascension_ledger, ascension_library_card) return published state with a source_classification field. ascension_execute submits a normal objective. ascension_code_walker submits a permission-scoped capability-extension objective for an existing authorized game/app/project/system. ascension_run_status reports either kind of run. These web tools record and observe requests; they do not themselves access a user's device, modify files, execute the governed cycle, or write governed ASCENSION state. Device/app/file actions belong to the authorized ASCENSION runtime / ExecutionEngine, and no change is Verified or Persisted until the governed core publishes the receipt. Absent fields and permissions are absent, never inferred.",
  tools: [
    chamberTool,
    knowledgeverseTool,
    pathwaysTool,
    governanceTool,
    ledgerTool,
    libraryCardTool,
    executeTool,
    codeWalkerTool,
    runStatusTool,
  ],
});
