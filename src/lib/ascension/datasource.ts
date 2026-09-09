import type { AscensionState, EntityRecord } from "./contracts";
import type { Json, SurfaceResponse } from "./observation-v1";
import {
  gatewayBaseUrl,
  getController,
  getGalaxyBridges,
  getGovernance,
  getKnowledgeverse,
  getLedger,
  getLibraryCard,
  getManifestation,
  getOutcomes,
  getPathways,
  getSnapshot,
  getStatus,
  toLiveObservation,
  type LiveObservation,
} from "./gateway";
import { AscensionSourceError } from "./errors";

/**
 * Data-source boundary for the ASCENSION observation console.
 *
 * The UI consumes ONLY this interface. Two implementations exist:
 *  - FixtureAscensionDataSource — published/demo state fixtures (development/test)
 *  - LiveAscensionDataSource    — placeholder for the Observation Gateway
 *
 * Observation only. No method mutates governed state and none ever will:
 * this interface deliberately exposes no write operation.
 */
export interface AscensionDataSource {
  /** Which kind of source this is. Never inferred, never disguised. */
  readonly mode: SourceMode;
  /** Human-readable provenance shown in the chrome. */
  readonly label: string;
  chamber(): Promise<AscensionState>;
  knowledgeverse(): Promise<AscensionState>;
  pathways(): Promise<AscensionState>;
  governance(): Promise<AscensionState>;
  ledger(): Promise<AscensionState>;
  libraryCard(entityId: string): Promise<EntityRecord | undefined>;
}

export type SourceMode = "fixture" | "live";

export { AscensionSourceError, asAscensionError } from "./errors";
export type { AscensionErrorCode } from "./errors";

/* ------------------------------------------------------------------ */
/* Fixture implementation — published/demo state copied read-only       */
/* ------------------------------------------------------------------ */

let fixtureCache: AscensionState | undefined;

async function loadFixtureSnapshot(): Promise<AscensionState> {
  if (fixtureCache) return fixtureCache;
  const [chamber, semantic, entities, constraints, evidence, worldModel, ledger, knowledgeForms] =
    await Promise.all([
      import("@/data/ascension/chamber_state.json"),
      import("@/data/ascension/semantic_state.json"),
      import("@/data/ascension/entities.json"),
      import("@/data/ascension/constraints.json"),
      import("@/data/ascension/evidence.json"),
      import("@/data/ascension/world_model.json"),
      import("@/data/ascension/ledger.json"),
      import("@/data/ascension/knowledge_forms.json"),
    ]);

  const state = {
    chamber: chamber.default,
    semantic: semantic.default,
    entities: entities.default,
    constraints: constraints.default,
    evidence: evidence.default,
    worldModel: worldModel.default,
    ledger: ledger.default,
    knowledgeForms: knowledgeForms.default,
  } as unknown as AscensionState;

  assertShape(state);
  fixtureCache = state;
  return state;
}

/**
 * Structural guard only. It never fills, defaults or invents a field —
 * absent fields stay absent so the UI can render them as unavailable.
 */
function assertShape(state: AscensionState): void {
  const missing: string[] = [];
  if (!state.chamber || typeof state.chamber !== "object") missing.push("chamber_state");
  if (!state.semantic || typeof state.semantic !== "object") missing.push("semantic_state");
  if (!state.entities || typeof state.entities !== "object") missing.push("entities");
  if (!state.worldModel || typeof state.worldModel !== "object") missing.push("world_model");
  if (!Array.isArray(state.ledger)) missing.push("ledger");
  if (!Array.isArray(state.knowledgeForms)) missing.push("knowledge_forms");
  if (missing.length) {
    throw new AscensionSourceError(
      "MALFORMED_SOURCE",
      "Published state did not match the source contracts.",
      `missing or wrong-typed: ${missing.join(", ")}`,
    );
  }
}

export class FixtureAscensionDataSource implements AscensionDataSource {
  readonly mode = "fixture" as const;
  readonly label = "Published demo state fixtures (state_demo)";

  private snapshot(): Promise<AscensionState> {
    return loadFixtureSnapshot();
  }

  chamber() {
    return this.snapshot();
  }
  knowledgeverse() {
    return this.snapshot();
  }
  pathways() {
    return this.snapshot();
  }
  governance() {
    return this.snapshot();
  }
  ledger() {
    return this.snapshot();
  }
  async libraryCard(entityId: string) {
    const state = await this.snapshot();
    return state.entities[entityId];
  }
}

/* ------------------------------------------------------------------ */
/* Live implementation — documented Observation Gateway v1 GET routes  */
/* ------------------------------------------------------------------ */

/**
 * Reads the ASCENSION Observation Gateway v1 (read-only, GET only).
 *
 * Every route and field comes from ASCENSION_OBSERVATION_API_V1.md and the
 * committed consumer contract. The snapshot is hash-verified before use, the
 * governed publication is preserved verbatim, and the LIVE_CONTROLLER chamber
 * read is kept in its own field — never merged into a governed revision.
 * Values absent from the publication stay absent, so the surfaces render
 * "unavailable" instead of an inferred value.
 */
export class LiveAscensionDataSource implements AscensionDataSource {
  readonly mode = "live" as const;
  readonly label = `ASCENSION Observation Gateway · ${gatewayBaseUrl()}`;

  private async base(): Promise<AscensionState> {
    const snapshot = await getSnapshot();
    return liveState(toLiveObservation(snapshot));
  }

  async chamber(): Promise<AscensionState> {
    const state = await this.base();
    const [status, manifestation, controller] = await Promise.all([
      getStatus().catch(surfaceError),
      getManifestation().catch(surfaceError),
      getController(),
    ]);
    const live = state.live!;
    live.surfaces["status"] = status;
    live.surfaces["manifestation"] = manifestation;
    live.controller = controller;
    return state;
  }

  async knowledgeverse(): Promise<AscensionState> {
    const state = await this.base();
    state.live!.surfaces["knowledgeverse"] = await getKnowledgeverse().catch(surfaceError);
    return state;
  }

  async pathways(): Promise<AscensionState> {
    const state = await this.base();
    const [pathways, outcomes] = await Promise.all([
      getPathways().catch(surfaceError),
      getOutcomes().catch(surfaceError),
    ]);
    state.live!.surfaces["pathways"] = pathways;
    state.live!.surfaces["outcomes"] = outcomes;
    return state;
  }

  async governance(): Promise<AscensionState> {
    const state = await this.base();
    const [governance, bridges] = await Promise.all([
      getGovernance().catch(surfaceError),
      getGalaxyBridges().catch(surfaceError),
    ]);
    state.live!.surfaces["governance"] = governance;
    state.live!.surfaces["galaxy-bridges"] = bridges;
    return state;
  }

  async ledger(): Promise<AscensionState> {
    const state = await this.base();
    state.live!.ledger = await getLedger().catch(() => undefined);
    return state;
  }

  async libraryCard(entityId: string): Promise<EntityRecord | undefined> {
    const card = await getLibraryCard(entityId);
    if (!card.data) return undefined;
    return { entity_id: entityId, live_card: card.data as unknown } as EntityRecord;
  }
}

/** A surface that failed is reported as unavailable, never fabricated. */
function surfaceError(cause: unknown) {
  return {
    schema_version: "ascension.observation.v1",
    generated_at: new Date().toISOString(),
    availability: "unavailable",
    error: cause instanceof Error ? cause.message : String(cause),
    snapshot_revision: null,
    snapshot_hash: null,
    data: null,
  } as SurfaceResponse;
}

/**
 * Governed publication → surface view model.
 *
 * Only fields the contract guarantees are mapped. The legacy fixture-shaped
 * containers stay empty for live reads: their field names belong to the demo
 * contracts and must not be projected onto governed publication values.
 */
function liveState(live: LiveObservation): AscensionState {
  const governed = live.governedState ?? {};
  const runtime = governed["runtime"] as Record<string, Json> | undefined;
  const provenance = live.provenance ?? {};
  const entities: Record<string, EntityRecord> = {};
  for (const form of live.forms) {
    entities[form.entity_id] = { entity_id: form.entity_id, sid: form.sid };
  }
  const outcomeStatus = typeof runtime?.["status"] === "string" ? (runtime["status"] as string) : undefined;
  const verification =
    typeof provenance["verification_status"] === "string"
      ? (provenance["verification_status"] as string)
      : undefined;
  const chamber: AscensionState["chamber"] = {};
  if (outcomeStatus !== undefined) chamber.outcome_status = outcomeStatus;
  if (verification !== undefined) chamber.verification_result = verification;
  if (live.publishedAt !== undefined) chamber.updated_at = live.publishedAt;
  const semantic: AscensionState["semantic"] = {};
  if (live.publishedAt !== undefined) semantic.updated_at = live.publishedAt;
  return {
    chamber,
    semantic,
    entities,
    constraints: {},
    evidence: {},
    worldModel: {},
    ledger: [],
    knowledgeForms: [],
    live,
  };
}

/* ------------------------------------------------------------------ */
/* Active-mode store — what the chrome must declare, never guessed     */
/* ------------------------------------------------------------------ */

export type ActiveSourceMode = "live" | "demo" | "unknown";

let activeMode: ActiveSourceMode = "unknown";
const modeListeners = new Set<() => void>();

export function getActiveSourceMode(): ActiveSourceMode {
  return activeMode;
}

export function subscribeActiveSourceMode(listener: () => void): () => void {
  modeListeners.add(listener);
  return () => modeListeners.delete(listener);
}

function setActiveSourceMode(next: ActiveSourceMode) {
  if (activeMode === next) return;
  activeMode = next;
  for (const listener of modeListeners) listener();
}

/* ------------------------------------------------------------------ */
/* Resilient source — LIVE_GOVERNED first, clearly-labelled DEMO only  */
/* when the gateway is unreachable. The two are never mixed.           */
/* ------------------------------------------------------------------ */

/** Only an unreachable/unconfigured gateway falls back; integrity faults surface. */
function gatewayUnreachable(error: unknown): boolean {
  const known = asAscensionError(error);
  return (
    known?.code === "LIVE_STATE_UNAVAILABLE" || known?.code === "LIVE_GATEWAY_NOT_CONFIGURED"
  );
}

/**
 * Reads LIVE_GOVERNED state whenever the Observation Gateway answers. When the
 * gateway cannot be reached at all, the whole surface is served from bundled
 * DEMO fixtures — never a per-field blend — and the active mode flips to "demo"
 * so the chrome shows the permanent DEMO MODE banner. Each read retries live
 * first, so the console returns to LIVE_GOVERNED by itself.
 */
export class ResilientAscensionDataSource implements AscensionDataSource {
  readonly mode = "live" as const;
  readonly label = `ASCENSION Observation Gateway · ${gatewayBaseUrl()} (DEMO fixtures only while unreachable)`;

  private readonly live = new LiveAscensionDataSource();
  private readonly demo = new FixtureAscensionDataSource();

  private async read<T>(live: () => Promise<T>, demo: () => Promise<T>): Promise<T> {
    try {
      const value = await live();
      setActiveSourceMode("live");
      return value;
    } catch (error) {
      if (!gatewayUnreachable(error)) throw error;
      setActiveSourceMode("demo");
      return demo();
    }
  }

  chamber() {
    return this.read(() => this.live.chamber(), () => this.demo.chamber());
  }
  knowledgeverse() {
    return this.read(() => this.live.knowledgeverse(), () => this.demo.knowledgeverse());
  }
  pathways() {
    return this.read(() => this.live.pathways(), () => this.demo.pathways());
  }
  governance() {
    return this.read(() => this.live.governance(), () => this.demo.governance());
  }
  ledger() {
    return this.read(() => this.live.ledger(), () => this.demo.ledger());
  }
  libraryCard(entityId: string) {
    return this.read(
      () => this.live.libraryCard(entityId),
      () => this.demo.libraryCard(entityId),
    );
  }
}

/* ------------------------------------------------------------------ */
/* Mode resolution                                                     */
/* ------------------------------------------------------------------ */

const env = import.meta.env as Record<string, string | boolean | undefined>;

/** Fixtures-only mode stays an explicit development/test opt-in. */
export function fixturesPermitted(): boolean {
  if (env["VITE_ASCENSION_SOURCE"] !== "fixture") return false;
  return env["DEV"] === true || env["VITE_ASCENSION_ALLOW_FIXTURES"] === "true";
}

let source: AscensionDataSource | undefined;

export function getAscensionDataSource(): AscensionDataSource {
  if (source) return source;
  if (fixturesPermitted()) {
    setActiveSourceMode("demo");
    source = new FixtureAscensionDataSource();
  } else {
    source = new ResilientAscensionDataSource();
  }
  return source;
}

/** Test seam only; not reachable from any UI interaction. */
export function __setAscensionDataSource(next: AscensionDataSource | undefined) {
  source = next;
}
