import type { Json } from "@/integrations/supabase/types";
import { ASCENSION_GUIDE_INSTRUCTIONS } from "./guide-personality.server";
import { buildGuideFallbackDelivery } from "./guide-fallback.server";
import {
  assessResult,
  hasEnvisionPreparation,
  notProducedMessage,
  parseDelivery,
  requestedKind,
  supportsEnvisionObjective,
  type ObjectiveDelivery,
} from "../result-model";
import {
  reviewObjectiveFit, stampObjectiveFit, type ObjectiveFitReview,
} from "./objective-fit.server";

const ORDINAL = 100;
const ARTIFACT_ORDINAL = 101;
const LABEL = "GOVERNED_RUNTIME_RESULT_V2";
const MODEL = "governed-runtime";

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function cleanGeneratedText(value: string): string {
  return value
    .replace(/&#x20;|&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#x27;|&#39;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\\([\\`*_[\]{}()#+\-.!>])/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function stripModelProvenanceClaims(value: string): string {
  return value
    .replace(
      /\bAccording to ASCENSION(?:'s)? internal (?:knowledge|records)(?:\s*\[[^\]]+\])?,?\s*/gi,
      "From general knowledge, ",
    )
    .replace(
      /\bASCENSION(?:'s)? internal (?:knowledge|records)(?:\s*\[[^\]]+\])?\s+(?:confirms|notes|shows|indicates|states|establishes|demonstrates|supports|suggests)\s+(?:that\s+)?/gi,
      "From general knowledge, ",
    )
    .replace(/\s*\[A\d+(?:\s*,\s*A?\d+)*\]/gi, "")
    .replace(/\bASCENSION(?:'s)? internal (?:knowledge|records)\b/gi, "general knowledge")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function artifactFiles(value: unknown): { name: string; content: string }[] {
  const payload = record(value);
  if (!Array.isArray(payload["files"])) return [];
  const names = new Set<string>();
  return payload["files"].flatMap((raw) => {
    const file = record(raw);
    const name = typeof file["name"] === "string" ? file["name"].trim() : "";
    const content = typeof file["content"] === "string" ? file["content"] : "";
    const key = name.toLowerCase();
    if (
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(name) ||
      name.includes("..") ||
      !content ||
      content.length > 100000 ||
      names.has(key)
    ) {
      return [];
    }
    names.add(key);
    return [{ name, content }];
  });
}

// RESTORE NOTICE: This commit restores core exports. Full original body with
// externalProductDraft, governedDelivery, needsSpiralExpansionRepair and
// delivery resolution must be recovered from commit 40dac830 if this partial
// restore is insufficient. The guide-fallback.server.ts module is complete.

export function governedDelivery(
  run: { objective: string; result: Json | null },
  transportedFiles: { name: string; content: string }[],
): ObjectiveDelivery | null {
  if (run.result === null) return null;
  const result = record(run.result);
  if (!Object.keys(result).length) return null;
  const titleSource =
    typeof result["objective_text"] === "string" && result["objective_text"].trim()
      ? result["objective_text"].trim()
      : run.objective.trim();
  return parseDelivery({
    kind: "answer",
    title: titleSource.slice(0, 200) || "ASCENSION result",
    body: "Governed result projection is temporarily limited. Use ENGAGE again shortly.",
    pathways: [],
    blend: null,
    files: [],
    limitations: ["Partial restore of delivery.server.ts — full governed projection pending."],
  });
}

export function needsSpiralExpansionRepair(): boolean {
  return false;
}

export async function externalProductDraft(
  run: {
    objective: string;
    evidence?: Json | null;
    constraints?: Json | null;
    result: Json | null;
    status?: string;
  },
  _transportedFiles: { name: string; content: string }[],
  _priorFit?: ObjectiveFitReview,
): Promise<ObjectiveDelivery> {
  // Prefer live providers when available; fall back to structured guide output.
  try {
    const { callZai } = await import("./zai.server");
    const system = [
      ASCENSION_GUIDE_INSTRUCTIONS,
      "Return exactly one JSON object with keys: kind, title, body, pathways, blend, files, limitations.",
      "For design/build objectives include three distinct pathways and a blend.",
      "Do not claim physical build, test, or governed verification.",
    ].join("\n");
    const generated = await callZai({
      system,
      user: `Objective: ${run.objective}\nProduce the user-facing ASCENSION result now.`,
      knowledgeQuery: run.objective,
      temperature: 0.25,
    });
    const candidate =
      generated.json ??
      ({
        kind: "answer",
        title: run.objective.slice(0, 200) || "ASCENSION result",
        body: generated.text.trim(),
        pathways: [],
        blend: null,
        files: [],
        limitations: [],
      } as Record<string, unknown>);
    if (typeof candidate["body"] === "string") {
      candidate["body"] = cleanGeneratedText(String(candidate["body"]));
    }
    if (typeof candidate["title"] === "string") {
      candidate["title"] = cleanGeneratedText(String(candidate["title"]));
    }
    if (!Array.isArray(candidate["limitations"])) candidate["limitations"] = [];
    return parseDelivery(candidate);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    const fallback = buildGuideFallbackDelivery(run.objective);
    return {
      ...fallback,
      limitations: [
        ...fallback.limitations,
        `Answer provider recovery note: ${detail.slice(0, 240)}`,
      ],
    };
  }
}

export const TERMINAL_STATUSES = new Set(["verified", "rejected", "failed"]);
export const DRAFT_ORDINAL = 102;
export const DRAFT_LABEL = "ASCENSION_GENERATED_RESULT";
export const ARTIFACT_GRACE_MS = 90_000;
export const DRAFT_STALE_MS = 180_000;

export interface ResolvedDelivery {
  created_at: string;
  status: "running" | "completed";
  response_payload: ObjectiveDelivery | null;
  error: string | null;
  engine_model: string | null;
  engine_label: string;
  note: string | null;
  source: "governed" | "external_draft" | null;
}

export interface DraftRow {
  status: string;
  created_at: string;
  response_payload: unknown;
  error: string | null;
  engine_model: string | null;
  source_key: string | null;
}

export interface DraftStore {
  claim(sourceKey: string, expectedCreatedAt: string | null): Promise<boolean>;
  complete(sourceKey: string, payload: ObjectiveDelivery): Promise<void>;
  fail(sourceKey: string, message: string): Promise<void>;
}

export interface DeliveryRun {
  id: string;
  objective: string;
  evidence?: Json | null;
  constraints?: Json | null;
  result: Json | null;
  status: string;
  completed_at?: string | null;
  created_at: string;
  engine?: string | null;
}
