import {
  sourceHasPermissions,
  type AuthorizedSource,
  type SourcePermission,
} from "./source-access";

export type CodeWalkerSystemType =
  | "game"
  | "application"
  | "website"
  | "cad"
  | "music"
  | "robotics"
  | "automation"
  | "custom_software";

export type CodeWalkerSurface = {
  source: AuthorizedSource;
  systemType: CodeWalkerSystemType;
  technologies: string[];
  entryPoints: string[];
  extensionPoints: string[];
  runtimeSignals: string[];
  protectedAreas: string[];
};

export type CodeWalkerStep = {
  stage:
    | "enter"
    | "trace"
    | "map"
    | "locate_extension"
    | "change"
    | "test"
    | "observe"
    | "verify";
  action: string;
  requiredPermissions: SourcePermission[];
};

export type CodeWalkerPlan = {
  objective: string;
  desiredCapability: string;
  sourceId: string;
  canInspect: boolean;
  canModify: boolean;
  canExecute: boolean;
  extensionPoints: string[];
  blockers: string[];
  steps: CodeWalkerStep[];
};

export const CODE_WALKER_SEQUENCE = [
  "enter system",
  "trace architecture",
  "map dependencies and data/control flow",
  "locate authorized extension points",
  "add or connect the capability",
  "run/test",
  "observe actual behavior",
  "AutoSync verify",
  "record verified change",
] as const;

function hasAny(source: AuthorizedSource, permissions: SourcePermission[]) {
  return permissions.some((permission) => source.permissions.includes(permission));
}

/**
 * Builds the permission-aware extension pathway for an already-authorized
 * software surface. This plans the walk; execution belongs to the authorized
 * ASCENSION runtime / ExecutionEngine and must produce receipts before the
 * change can be called verified.
 */
export function buildCodeWalkerPlan(input: {
  objective: string;
  desiredCapability: string;
  surface: CodeWalkerSurface;
}): CodeWalkerPlan {
  const { objective, desiredCapability, surface } = input;
  const source = surface.source;
  const canInspect = sourceHasPermissions(source, ["read"]);
  const canModify = canInspect && hasAny(source, ["write", "create", "control"]);
  const canExecute = canInspect && hasAny(source, ["execute", "control"]);
  const blockers: string[] = [];

  if (!source.grantedByUser) blockers.push("User authorization has not been granted for this source.");
  if (!source.connected) blockers.push("The source is not connected.");
  if (!canInspect) blockers.push("Read access is required before Code Walker can map the system.");
  if (!canModify) blockers.push("Write/create/control permission is required to add capability.");
  if (!canExecute) blockers.push("Execute/control permission is required to run or test the modified system.");
  if (!surface.extensionPoints.length)
    blockers.push("No extension point has been observed yet; inspection must locate one before modification.");

  const steps: CodeWalkerStep[] = [
    {
      stage: "enter",
      action: `Open the authorized ${surface.systemType} surface and inventory the accessible project/runtime boundaries.`,
      requiredPermissions: ["read"],
    },
    {
      stage: "trace",
      action: "Trace code, project files, configs, assets, APIs, plugins, runtime state, logs, and service connections that participate in the target behavior.",
      requiredPermissions: ["read", "search"],
    },
    {
      stage: "map",
      action: "Build a capability map showing current behavior, dependencies, data flow, control flow, protected areas, and available extension mechanisms.",
      requiredPermissions: ["read"],
    },
    {
      stage: "locate_extension",
      action: `Select the narrowest authorized extension point able to add: ${desiredCapability}`,
      requiredPermissions: ["read"],
    },
    {
      stage: "change",
      action: `Modify or connect only what is required to add the capability while preserving unrelated behavior: ${desiredCapability}`,
      requiredPermissions: ["write"],
    },
    {
      stage: "test",
      action: "Build, launch, or invoke the supported test path for the changed capability.",
      requiredPermissions: ["execute"],
    },
    {
      stage: "observe",
      action: "Capture runtime behavior, logs, artifacts, errors, and before/after evidence from the real system.",
      requiredPermissions: ["read"],
    },
    {
      stage: "verify",
      action: "Compare expected behavior with observed behavior; only a verified result can update persistent ASCENSION state and Δ.",
      requiredPermissions: ["read"],
    },
  ];

  return {
    objective,
    desiredCapability,
    sourceId: source.id,
    canInspect,
    canModify,
    canExecute,
    extensionPoints: [...surface.extensionPoints],
    blockers,
    steps,
  };
}

/**
 * Installed-only games/apps must use supported extension surfaces. Code Walker
 * does not treat bypassing protections, anti-cheat, authentication, or access
 * controls as a valid extension point.
 */
export function supportedInstalledOnlyExtensionPoint(point: string): boolean {
  const normalized = point.trim().toLowerCase();
  return [
    "mod api",
    "plugin api",
    "scripting api",
    "save/config",
    "configuration",
    "telemetry",
    "overlay",
    "companion api",
    "official sdk",
  ].some((allowed) => normalized.includes(allowed));
}
