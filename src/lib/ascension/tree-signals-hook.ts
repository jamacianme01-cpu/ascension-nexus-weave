import { useCallback, useEffect, useRef } from "react";

export type TreeSignalEvent = "selection" | "skip" | "refine" | "return";

export type TreeSignal = {
  event: TreeSignalEvent;
  pathwayLabel?: string;
  objective?: string;
  timestamp: number;
  sessionId: string;
  context?: Record<string, unknown>;
};

const SESSION_KEY = "ascension_tree_session";

function getSessionId(): string {
  if (typeof window === "undefined") return "server";
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

async function postSignal(signal: TreeSignal): Promise<void> {
  try {
    await fetch("/api/public/ascension/tree-signals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(signal),
      keepalive: true,
    });
  } catch {
    // signals are best-effort; never block the UI
  }
}

export function useTreeSignals() {
  const sessionId = useRef(getSessionId());
  const lastEvent = useRef<TreeSignalEvent | null>(null);

  const emit = useCallback(
    (event: TreeSignalEvent, detail?: { pathwayLabel?: string; objective?: string; context?: Record<string, unknown> }) => {
      lastEvent.current = event;
      postSignal({
        event,
        pathwayLabel: detail?.pathwayLabel,
        objective: detail?.objective,
        timestamp: Date.now(),
        sessionId: sessionId.current,
        context: detail?.context,
      });
    },
    [],
  );

  // record a return when the user comes back after being away
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && lastEvent.current) {
        emit("return");
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [emit]);

  return { emit, sessionId: sessionId.current };
}
