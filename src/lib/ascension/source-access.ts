export type SourceKind =
  | "file_system"
  | "repository"
  | "application"
  | "game_project"
  | "plugin_api"
  | "runtime"
  | "device"
  | "cloud_service";

export type SourcePermission = "read" | "search" | "write" | "create" | "execute" | "control";

export type AuthorizedSource = {
  id: string;
  kind: SourceKind;
  label: string;
  location?: string;
  permissions: SourcePermission[];
  connected: boolean;
  grantedByUser: boolean;
  metadata?: Record<string, unknown>;
};

export type AscensionIntent =
  | "general_question"
  | "personalized_pathway"
  | "destiny"
  | "objective"
  | "execution"
  | "capability_extension";

export type LibraryCardAccessDecision = {
  allowed: boolean;
  libraryCardRequired: boolean;
  reason: string;
};

/**
 * General questions may use ASCENSION without a Library Card. Personalized
 * pathway work and anything that acts on the person's real state requires the
 * Library Card before the Book / Knowledgeverse experience begins.
 */
export function libraryCardAccess(intent: AscensionIntent, hasLibraryCard: boolean): LibraryCardAccessDecision {
  if (intent === "general_question") {
    return {
      allowed: true,
      libraryCardRequired: false,
      reason: "General questions may use basic pathway access without a Library Card.",
    };
  }

  return hasLibraryCard
    ? {
        allowed: true,
        libraryCardRequired: true,
        reason: "Personalized ASCENSION work is grounded in the existing Library Card.",
      }
    : {
        allowed: false,
        libraryCardRequired: true,
        reason: "Complete the Library Card before personalized pathway, Destiny, objective, execution, or capability-extension work.",
      };
}

export function sourceHasPermissions(source: AuthorizedSource, required: SourcePermission[]): boolean {
  if (!source.connected || !source.grantedByUser) return false;
  const held = new Set(source.permissions);
  return required.every((permission) => held.has(permission));
}

export function readableSources(sources: AuthorizedSource[]): AuthorizedSource[] {
  return sources.filter((source) => sourceHasPermissions(source, ["read"]));
}

export function actionableSources(sources: AuthorizedSource[]): AuthorizedSource[] {
  return sources.filter(
    (source) =>
      sourceHasPermissions(source, ["read"]) &&
      source.permissions.some((permission) =>
        (["write", "create", "execute", "control"] as SourcePermission[]).includes(permission),
      ),
  );
}

/**
 * The Library Card is constructed from user-authorized sources and then evolves
 * from verified ASCENSION history. Device/app access is permissioned; absence
 * of permission is never treated as permission.
 */
export type LibraryCardSourceSnapshot = {
  sourceId: string;
  observedAt: string;
  facts: Record<string, unknown>;
  provenance: "user_supplied" | "authorized_source" | "ascension_verified_history";
};
