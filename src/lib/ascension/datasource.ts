import type { AscensionState, EntityRecord } from "./contracts";

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
/* Live implementation — intentionally empty until the contract lands  */
/* ------------------------------------------------------------------ */

/**
 * Placeholder for the ASCENSION Observation Gateway.
 *
 * NO endpoint schema, response shape, field name or value is invented here.
 * Every method fails with LIVE_GATEWAY_NOT_CONFIGURED until the real
 * read-only gateway contract is supplied. When it arrives, only this class
 * changes — the surfaces above it do not.
 */
export class LiveAscensionDataSource implements AscensionDataSource {
  readonly mode = "live" as const;
  readonly label = "ASCENSION Observation Gateway";

  private notConfigured(): never {
    throw new AscensionSourceError(
      "LIVE_GATEWAY_NOT_CONFIGURED",
      "LIVE ASCENSION STATE UNAVAILABLE",
      "No Observation Gateway contract is configured. Demo state is not substituted.",
    );
  }

  chamber(): Promise<AscensionState> {
    this.notConfigured();
  }
  knowledgeverse(): Promise<AscensionState> {
    this.notConfigured();
  }
  pathways(): Promise<AscensionState> {
    this.notConfigured();
  }
  governance(): Promise<AscensionState> {
    this.notConfigured();
  }
  ledger(): Promise<AscensionState> {
    this.notConfigured();
  }
  libraryCard(): Promise<EntityRecord | undefined> {
    this.notConfigured();
  }
}

/* ------------------------------------------------------------------ */
/* Mode resolution — production may never silently serve fixtures      */
/* ------------------------------------------------------------------ */

const env = import.meta.env as Record<string, string | boolean | undefined>;

/** Fixtures are a development/test source. Production must opt in loudly. */
export function fixturesPermitted(): boolean {
  if (env["DEV"] === true) return true;
  return env["VITE_ASCENSION_ALLOW_FIXTURES"] === "true";
}

let source: AscensionDataSource | undefined;

export function getAscensionDataSource(): AscensionDataSource {
  if (source) return source;
  const requested = env["VITE_ASCENSION_SOURCE"];
  source =
    requested === "live" || !fixturesPermitted()
      ? new LiveAscensionDataSource()
      : new FixtureAscensionDataSource();
  return source;
}

/** Test seam only; not reachable from any UI interaction. */
export function __setAscensionDataSource(next: AscensionDataSource | undefined) {
  source = next;
}
