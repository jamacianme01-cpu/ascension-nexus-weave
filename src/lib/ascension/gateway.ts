/**
 * ASCENSION Observation Gateway v1 client.
 *
 * READ-ONLY. Every request here is a documented GET from
 * docs/interfaces/ASCENSION_OBSERVATION_API_V1.md, parsed with the committed
 * consumer contract (./observation-v1.ts). No endpoint, field name, default or
 * fallback value is invented, and no mutating method exists.
 */
import {
  fetchChamber,
  verifySnapshotText,
  type ChamberResponse,
  type Json,
  type KnowledgeForm as LiveKnowledgeForm,
  type LedgerResponse,
  type Snapshot,
  type SurfaceResponse,
} from "./observation-v1";
import { AscensionSourceError } from "./datasource";

const env = import.meta.env as Record<string, string | boolean | undefined>;

/** Configurable; defaults to the documented loopback gateway. */
export function gatewayBaseUrl(): string {
  const configured = env["VITE_ASCENSION_GATEWAY_URL"];
  return (typeof configured === "string" && configured.trim()) || "http://localhost:8765";
}

const API = "/api/ascension/v1";

function unreachable(detail: string): never {
  throw new AscensionSourceError(
    "LIVE_STATE_UNAVAILABLE",
    "LIVE ASCENSION STATE UNAVAILABLE",
    detail,
  );
}

async function getText(path: string): Promise<{ text: string; status: number }> {
  if (typeof window === "undefined") {
    unreachable("Observation reads are browser-direct; the gateway is not read during server render.");
  }
  let response: Response;
  try {
    response = await fetch(`${gatewayBaseUrl().replace(/\/$/, "")}${API}${path}`, {
      method: "GET",
      credentials: "omit",
    });
  } catch (cause) {
    unreachable(
      `Gateway not reachable at ${gatewayBaseUrl()} (${cause instanceof Error ? cause.message : String(cause)}).`,
    );
  }
  if (!response.ok && response.status !== 503) {
    unreachable(`Observation HTTP ${response.status} for ${API}${path}`);
  }
  return { text: await response.text(), status: response.status };
}

async function getSurface<T = Json>(path: string): Promise<SurfaceResponse<T>> {
  const { text } = await getText(path);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new AscensionSourceError(
      "MALFORMED_SOURCE",
      "Gateway response was not valid JSON.",
      `${API}${path}`,
    );
  }
  const record = value as Record<string, unknown>;
  if (record?.["schema_version"] !== "ascension.observation.v1") {
    throw new AscensionSourceError(
      "MALFORMED_SOURCE",
      "Gateway response did not carry schema ascension.observation.v1.",
      `${API}${path}`,
    );
  }
  return value as SurfaceResponse<T>;
}

/** GET /snapshot — hash-verified against the original response bytes. */
export async function getSnapshot(): Promise<Snapshot> {
  const { text } = await getText("/snapshot");
  try {
    return await verifySnapshotText(text);
  } catch (cause) {
    throw new AscensionSourceError(
      "MALFORMED_SOURCE",
      "Published snapshot failed contract validation or hash verification.",
      cause instanceof Error ? cause.message : String(cause),
    );
  }
}

export const getStatus = () => getSurface("/status");
export const getKnowledgeverse = () => getSurface("/knowledgeverse");
export const getPathways = () => getSurface("/pathways");
export const getGovernance = () => getSurface("/governance");
export const getOutcomes = () => getSurface("/outcomes");
export const getGalaxyBridges = () => getSurface("/galaxy-bridges");
export const getManifestation = () => getSurface("/manifestation");

/** GET /library-card/{entity_id} — the form ID is URL-encoded as documented. */
export const getLibraryCard = (entityId: string) =>
  getSurface(`/library-card/${encodeURIComponent(entityId)}`);

/** GET /ledger — ledger_valid may be null (closure ledger has no hash chain). */
export async function getLedger(): Promise<LedgerResponse> {
  const { text } = await getText("/ledger");
  const value = JSON.parse(text) as LedgerResponse;
  if (value?.schema_version !== "ascension.observation.v1") {
    throw new AscensionSourceError("MALFORMED_SOURCE", "Ledger response schema mismatch.", "/ledger");
  }
  return value;
}

/**
 * GET /chamber — the independent LIVE_CONTROLLER publication.
 * Never merged into a governed revision. Unreachable controller state is
 * reported, not raised: the governed surfaces stay readable without it.
 */
export async function getController(): Promise<ChamberResponse | { error: string }> {
  if (typeof window === "undefined") return { error: "not read during server render" };
  try {
    return await fetchChamber(gatewayBaseUrl());
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : String(cause) };
  }
}

export type LiveObservation = {
  /** Gateway availability semantics, preserved verbatim. */
  availability: Snapshot["availability"];
  error: string | null;
  generatedAt: string;
  snapshotHash: string | null;
  snapshotRevision?: number | undefined;
  /** LIVE_GOVERNED when the governed publication is present. */
  sourceClassification: string;
  publicationRevision?: number | undefined;
  contentHash?: string | undefined;
  publishedAt?: string | undefined;
  knowledgeverseId?: string | undefined;
  provenance?: Record<string, Json> | undefined;
  governedState?: Record<string, Json> | undefined;
  forms: LiveKnowledgeForm[];
  ledger?: LedgerResponse | undefined;
  surfaces: Record<string, SurfaceResponse | undefined>;
  controller?: ChamberResponse | { error: string } | undefined;
  gatewayUrl: string;
};

/** Projects a verified snapshot into the observation view model. Nothing is inferred. */
export function toLiveObservation(snapshot: Snapshot): LiveObservation {
  const content = snapshot.content;
  if (!content) {
    throw new AscensionSourceError(
      "LIVE_STATE_UNAVAILABLE",
      "LIVE ASCENSION STATE UNAVAILABLE",
      snapshot.error ?? "Gateway reported availability: unavailable with null content.",
    );
  }
  const governed = content.governed_state;
  const provenance = content.publication_provenance;
  const revisions = content.source_revisions["governed"] ?? content.source_revisions["manifestation"];
  const classification = provenance?.["source_classification"];
  return {
    availability: snapshot.availability,
    error: snapshot.error,
    generatedAt: snapshot.generated_at,
    snapshotHash: snapshot.snapshot_hash,
    snapshotRevision: content.snapshot_revision,
    sourceClassification: typeof classification === "string" ? classification : "UNAVAILABLE",
    publicationRevision:
      typeof provenance?.["publication_revision"] === "number"
        ? (provenance["publication_revision"] as number)
        : undefined,
    contentHash: typeof provenance?.["content_hash"] === "string" ? provenance["content_hash"] : revisions?.state_hash,
    publishedAt: revisions?.published_at,
    knowledgeverseId: content.knowledgeverse_id,
    provenance: provenance,
    governedState: governed,
    forms: content.knowledge_forms,
    surfaces: {},
    gatewayUrl: gatewayBaseUrl(),
  };
}
