import { useCallback, useRef } from "react";

export type TreeSignalType = "select" | "skip" | "refine" | "return" | "engage";

export type TreeSignalPayload = {
  type: TreeSignalType;
  objective?: string;
  pathwayId?: string;
  pathwayLabel?: string;
  meaningElements?: string[];
  spiralForms?: string[];
};

/**
 * Posts engagement events to /api/public/ascension/tree-signals.
 * Fire-and-forget from the client — never blocks UI, never throws to caller.
 */
export function useTreeSignals() {
  const lastPosted = useRef<string>("");

  const post = useCallback((payload: TreeSignalPayload) => {
    const key = `${payload.type}|${payload.pathwayId ?? ""}|${payload.objective ?? ""}`;
    // Deduplicate rapid identical posts (e.g. double-click).
    if (lastPosted.current === key) return;
    lastPosted.current = key;
    setTimeout(() => {
      lastPosted.current = "";
    }, 2000);

    try {
      void fetch("/api/public/ascension/tree-signals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
      });
    } catch {
      /* Network down — Tree just goes quiet. */
    }
  }, []);

  return post;
}
