import { queryOptions } from "@tanstack/react-query";

import { getAscensionDataSource, type AscensionDataSource } from "./datasource";
import type {
  AscensionState,
  KnowledgeForm,
  MeaningElementRef,
  Transition,
} from "./contracts";

/**
 * Observation-only read layer. All reads go through the AscensionDataSource
 * boundary, so the surfaces never know whether state came from published
 * fixtures or (later) the read-only Observation Gateway. No write path exists.
 */
export type AscensionSurfaceName =
  | "chamber"
  | "knowledgeverse"
  | "pathways"
  | "governance"
  | "ledger";

export function surfaceQuery(surface: AscensionSurfaceName) {
  return queryOptions({
    queryKey: ["ascension", surface],
    queryFn: (): Promise<AscensionState> => {
      const source: AscensionDataSource = getAscensionDataSource();
      return source[surface]();
    },
    staleTime: 15_000,
    // Each refetch attempts the governed gateway first, so the console
    // returns to LIVE_GOVERNED on its own once the gateway answers again.
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
}

export function libraryCardQuery(entityId: string) {
  return queryOptions({
    queryKey: ["ascension", "library-card", entityId],
    queryFn: () => getAscensionDataSource().libraryCard(entityId),
    staleTime: 30_000,
    retry: false,
  });
}

/** Legacy alias kept so existing callers resolve to the chamber surface. */
export const ascensionStateQuery = surfaceQuery("chamber");


/** ME ids follow `ME:v1-text:<lexeme-slug>:<category>:<hash>`. */
export function parseMeId(meId: string): {
  me_id: string;
  scheme?: string | undefined;
  lexeme?: string | undefined;
  category?: string | undefined;
  hash?: string | undefined;
} {
  const parts = meId.split(":");
  if (parts[0] !== "ME") return { me_id: meId };
  // Two id schemes exist in the published state: the current
  // `ME:<scheme>:<lexeme>:<category>:<hash>` and a legacy `ME:<lexeme>:<category>:<hash>`.
  if (parts.length >= 5) {
    return {
      me_id: meId,
      scheme: parts[1],
      lexeme: parts[2]?.replace(/-/g, " "),
      category: parts[3],
      hash: parts[4],
    };
  }
  if (parts.length === 4) {
    return {
      me_id: meId,
      lexeme: parts[1]?.replace(/-/g, " "),
      category: parts[2],
      hash: parts[3],
    };
  }
  return { me_id: meId };
}

export type MeaningElement = ReturnType<typeof parseMeId> & {
  text?: string | undefined;
  source?: string | undefined;
  usedBy: string[];
};

/** Builds the ME index strictly from ids/refs already present in the state files. */
export function buildMeaningElements(state: AscensionState): MeaningElement[] {
  const index = new Map<string, MeaningElement>();

  const touch = (meId: string, owner?: string, extra?: Partial<MeaningElement>) => {
    const existing = index.get(meId) ?? { ...parseMeId(meId), usedBy: [] };
    const next: MeaningElement = { ...existing, ...stripEmpty(extra) };
    if (owner && !next.usedBy.includes(owner)) next.usedBy = [...next.usedBy, owner];
    index.set(meId, next);
  };

  for (const [entityKey, entity] of Object.entries(state.entities)) {
    for (const meId of entity.me_ids ?? []) touch(meId, entityKey);
    for (const [destinyId, destiny] of Object.entries(entity.destinies ?? {})) {
      for (const ref of destiny.constraint_mes ?? []) {
        touch(ref.me_id, destinyId, { text: ref.text, source: ref.source, category: ref.category });
      }
    }
  }

  for (const [key, known] of Object.entries(state.worldModel.known_state ?? {})) {
    for (const meId of known.me_ids ?? []) touch(meId, key);
  }

  for (const form of state.knowledgeForms) {
    for (const ref of parseKnowledgeFormMes(form)) {
      touch(ref.me_id, form.file, { text: ref.text, category: ref.category });
    }
  }

  return [...index.values()].sort((a, b) =>
    (a.category ?? "").localeCompare(b.category ?? "") || a.me_id.localeCompare(b.me_id),
  );
}

/** Extracts the ME blocks authored inside a published Knowledge Form artifact. */
export function parseKnowledgeFormMes(form: KnowledgeForm): MeaningElementRef[] {
  const refs: MeaningElementRef[] = [];
  const lines = form.content.split(/\r?\n/);
  lines.forEach((line, i) => {
    const match = line.match(/^##\s+ME\s+\[([^\]]+)\]\s+(ME:\S+)/);
    if (!match) return;
    const textLine = lines[i + 1]?.match(/^-\s*text:\s*(.+)$/);
    refs.push({
      me_id: match[2]!,
      category: match[1]!,
      text: textLine?.[1]?.trim(),
    });
  });
  return refs;
}

export function knowledgeFormTitle(form: KnowledgeForm): string | undefined {
  return form.content.split(/\r?\n/)[0]?.replace(/^#\s*/, "").trim() || undefined;
}

export function knowledgeFormBranch(form: KnowledgeForm): string | undefined {
  return form.content.match(/_Executed branch:\s*(\S+)_/)?.[1];
}

export function knowledgeFormSections(form: KnowledgeForm): string[] {
  const block = form.content.split("## Required Sections")[1];
  if (!block) return [];
  return block
    .split(/\r?\n/)
    .map((l) => l.match(/^-\s*(.+)$/)?.[1]?.trim())
    .filter((v): v is string => Boolean(v));
}

export function shortHash(hash?: string | null, size = 10): string | undefined {
  if (!hash) return undefined;
  return hash.length <= size * 2 ? hash : `${hash.slice(0, size)}…${hash.slice(-size)}`;
}

/** True when a ledger record's previous_hash matches the prior record's record_hash. */
export function chainLinkIntact(prev: Transition | undefined, current: Transition): boolean {
  const expected = prev?.record_hash ?? "0".repeat(64);
  return current.previous_hash === expected;
}

export function basename(path?: string): string | undefined {
  if (!path) return undefined;
  return path.split(/[\\/]/).pop() ?? path;
}

function stripEmpty<T extends object>(value?: T): Partial<T> {
  if (!value) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined && v !== null && v !== ""),
  ) as Partial<T>;
}
