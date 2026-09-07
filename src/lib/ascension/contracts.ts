/**
 * Typed mirrors of the ASCENSION published/demo state contracts.
 *
 * READ-ONLY. These types describe files produced by the governed core
 * (ASCENSION_CORE/state_demo). Every field that is not guaranteed present in
 * the source fixtures is optional, so the UI can render "unavailable" instead
 * of fabricating a value. No type here adds, renames, or reinterprets a field.
 */

export type Delta = { K: number; U: number; W: number };

export type BranchEvaluation = {
  confidence?: number;
  contradictions?: string[];
  guardian?: string;
  maturity_bonus?: number;
  outcome_predictor?: number;
  recommended_by?: string;
  violations?: string[];
};

export type BranchExpectation = {
  artifact_name?: string;
  artifact?: string;
  min_bytes?: number;
  required_sections?: string[];
};

export type Branch = {
  branch_id: string;
  approach?: string;
  capability?: string;
  confidence?: number;
  actions?: string[];
  risks?: string[];
  status?: string;
  evaluation?: BranchEvaluation;
  expected?: BranchExpectation;
};

export type ExecutionReceiptFile = {
  action?: string;
  bytes?: number;
  path?: string;
  sha256?: string;
};

export type ExecutionReceipt = {
  action?: string;
  artifact?: string;
  bytes?: number;
  capability?: string;
  sha256?: string;
  total_bytes?: number;
  files?: ExecutionReceiptFile[];
};

export type ObservedEvidence = {
  artifact_path?: string;
  captured_at?: string;
  evidence_id?: string;
  kind?: string;
  sha256?: string;
  size_bytes?: number;
};

export type Verification = {
  result?: string;
  mismatches?: string[];
  expected?: Record<string, unknown>;
  observed?: Record<string, unknown>;
};

export type ConstraintRecord = {
  constraint_id: string;
  authority?: string;
  banned_tokens?: string[];
  broad?: boolean;
  confidence?: number;
  created_at?: string;
  entity_id?: string;
  evidence_transition?: string | null;
  meaning?: string;
  scope_domain_tokens?: string[];
  scope_subject?: string[];
  source_destiny_id?: string;
  status?: string;
  superseded_by?: string | null;
  applicability_reason?: string;
};

export type ConstraintGovernance = {
  applicable?: ConstraintRecord[];
  remembered_not_applicable?: ConstraintRecord[];
  superseded?: ConstraintRecord[];
};

export type Transition = {
  transition_id?: string;
  timestamp?: string;
  authority?: string;
  entity_id?: string;
  destiny?: string;
  destiny_id?: string;
  sid?: string;
  branch_id?: string;
  branches?: Branch[];
  proposed_delta?: Delta;
  accepted_delta?: Delta;
  outcome_status?: string;
  rejection_reason?: string | null;
  rejection_reason_extra?: string | null;
  previous_hash?: string;
  record_hash?: string;
  previous_state_hash?: string;
  persisted?: boolean;
  persisted_hash?: string;
  execution_receipt?: ExecutionReceipt;
  observed_evidence?: ObservedEvidence;
  verification?: Verification;
  constraint_governance?: ConstraintGovernance;
  delta_k?: number;
  delta_u?: number;
  delta_w?: number;
};

export type ChamberState = {
  destiny?: string;
  entity_id?: string;
  entity_delta_total?: Delta;
  last_transition?: Transition;
  ledger_entries?: number;
  ledger_valid?: boolean;
  outcome_status?: string;
  record_hash?: string;
  transition_id?: string;
  updated_at?: string;
  verification_result?: string;
  verified_transitions?: number;
};

export type SemanticState = {
  ledger_entries?: number;
  ledger_valid?: boolean;
  verified_transitions?: number;
  updated_at?: string;
  transition?: Transition;
};

export type MeaningElementRef = {
  me_id: string;
  category?: string | undefined;
  source?: string | undefined;
  text?: string | undefined;
};

export type DestinyRecord = {
  destiny?: string;
  cycles?: number;
  constraint_mes?: MeaningElementRef[];
};

export type EntityRecord = {
  entity_id?: string;
  sid?: string;
  operator_label?: string;
  created_at?: string;
  delta?: Delta;
  destiny?: string;
  destinies?: Record<string, DestinyRecord>;
  lineage?: string[];
  me_ids?: string[];
  chromosome?: unknown;
  genesis?: unknown;
  /** Published Library Card payload as returned by the live gateway. */
  live_card?: unknown;
};

export type EntitiesFile = Record<string, EntityRecord>;

export type Relationship = {
  a: string;
  b: string;
  kind?: string;
  shared_mes?: string[];
};

export type EmergenceCandidate = {
  note?: string;
  status?: string;
  shared_mes?: string[];
};

export type KnownStateRecord = {
  artifact?: string;
  artifact_sha256?: string;
  delta?: Delta;
  entity_id?: string;
  me_ids?: string[];
  sid?: string;
};

export type WorldModel = {
  world_model_version?: number;
  state_hash?: string;
  updated_at?: string;
  last_destiny?: string;
  relationships?: Relationship[];
  emergence_candidates?: EmergenceCandidate[];
  known_state?: Record<string, KnownStateRecord>;
};

export type EvidenceRecord = {
  evidence_id: string;
  artifact_sha256?: string;
  confidence?: number;
  independence?: string;
  measurement?: string;
  method?: string;
  observer?: string;
  size_bytes?: number;
  source?: string;
  target?: string;
  timestamp?: string;
  transitions_supported?: string[];
};

export type ConstraintsFile = { constraints?: Record<string, ConstraintRecord> };
export type EvidenceFile = { evidence?: Record<string, EvidenceRecord> };

export type KnowledgeForm = { file: string; content: string };

export type AscensionState = {
  chamber: ChamberState;
  semantic: SemanticState;
  entities: EntitiesFile;
  constraints: ConstraintsFile;
  evidence: EvidenceFile;
  worldModel: WorldModel;
  ledger: Transition[];
  knowledgeForms: KnowledgeForm[];
  /**
   * Present only when the read came from the live Observation Gateway.
   * Carries the governed publication verbatim (classification, revision,
   * hashes, forms, surface payloads) plus the separate LIVE_CONTROLLER read.
   */
  live?: import("./gateway").LiveObservation | undefined;
};
