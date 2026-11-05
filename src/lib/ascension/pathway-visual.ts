import type { PictureWatch } from "@/lib/ascension/picture-watchdog";

type VisualPath = { id: string; title: string; summary: string; parts: unknown[]; steps: string[] };
export const pathwayVisualKey = (objective: string, path: VisualPath) =>
  JSON.stringify([objective, path.id, path.title, path.summary, path.parts, path.steps]);
const pending = new Map<string, Promise<string>>();
let queue = Promise.resolve();
let nextAllowed = 0;
/** One source per design, shared by the choice card and its inspection view. */
export function loadPathwayVisual(objective: string, path: VisualPath,
  cache: Map<string, string>, signal: AbortSignal, onWatch?: (notes: PictureWatch[]) => void): Promise<string> {
  const key = pathwayVisualKey(objective, path);
  const saved = cache.get(key);
  if (saved) return Promise.resolve(saved);
  const active = pending.get(key);
  if (active) return active;
  const work = queue.then(async () => {
    signal.throwIfAborted();
    const delay = Math.max(0, nextAllowed - Date.now());
    if (delay) await new Promise<void>((resolve, reject) => {
      const stop = () => { window.clearTimeout(timer); reject(signal.reason); };
      const timer = window.setTimeout(() => { signal.removeEventListener("abort", stop); resolve(); }, delay);
      signal.addEventListener("abort", stop, { once: true });
    });
    signal.throwIfAborted();
    const response = await fetch("/api/public/ascension/independent", {
      method: "POST", signal, headers: { "content-type": "application/json" },
      body: JSON.stringify({ objective, phase: "picture", view: "assembled", pathway: path }),
    });
    const data = await response.json() as { image_url?: string; error?: string; next_request_delay_ms?: number; picture_watch?: PictureWatch[] };
    if (Array.isArray(data.picture_watch) && data.picture_watch.length) onWatch?.(data.picture_watch);
    if (!response.ok) throw new Error(data.error || "The design preview could not be generated.");
    if (!data.image_url || !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]{4000,12000000}$/i.test(data.image_url))
      throw new Error("The design generator returned no usable image.");
    nextAllowed = Date.now() + Math.max(0, Math.min(60000, data.next_request_delay_ms ?? 0));
    cache.set(key, data.image_url);
    return data.image_url;
  });
  pending.set(key, work);
  queue = work.then(() => {}, () => {});
  void work.finally(() => pending.delete(key)).catch(() => {});
  return work;
}
