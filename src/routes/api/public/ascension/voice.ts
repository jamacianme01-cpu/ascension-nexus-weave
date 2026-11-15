import { createFileRoute } from "@tanstack/react-router";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Spoken fallback for the Tree when the browser has no speech voice.
 * espeak-ng is optional and local. This does not call a model provider.
 */
const recent: number[] = [];

function allowed(request: Request) {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if (site === "cross-site") return false;
  if (!origin) return true;
  const host = (request.headers.get("host") || "").split(":")[0];
  try { return new URL(origin).hostname === host; } catch { return false; }
}

function spokenWav(text: string) {
  return new Promise<Buffer>((resolve, reject) => {
    mkdtemp(join(tmpdir(), "tree-voice-")).then(dir => {
      const file = join(dir, "line.wav");
      const child = spawn("espeak-ng", ["-s", "138", "-w", file, text], { timeout: 8000 });
      let failed = false;
      child.on("error", error => { failed = true; reject(error); });
      child.on("close", code => {
        if (failed) return;
        if (code !== 0) {
          rm(dir, { recursive: true, force: true }).catch(() => {});
          reject(new Error("The Tree could not speak."));
          return;
        }
        readFile(file).then(bytes => {
          rm(dir, { recursive: true, force: true }).catch(() => {});
          resolve(bytes);
        }, reject);
      });
    }, reject);
  });
}

export const Route = createFileRoute("/api/public/ascension/voice")({
  server: { handlers: {
    POST: async ({ request }) => {
      if (!allowed(request)) return new Response("Cross-site requests are not permitted.", { status: 403 });
      const now = Date.now();
      while (recent.length && now - recent[0]! > 60_000) recent.shift();
      if (recent.length > 30) return new Response("Too many spoken lines.", { status: 429 });
      let text = "";
      try {
        const body = await request.json() as { text?: unknown };
        text = typeof body.text === "string" ? body.text.trim().slice(0, 220) : "";
      } catch {
        return new Response("The Tree could not speak.", { status: 400 });
      }
      if (text.length < 2) return new Response("The Tree could not speak.", { status: 400 });
      try {
        const wav = await spokenWav(text);
        recent.push(now);
        return new Response(new Uint8Array(wav), {
          status: 200,
          headers: { "content-type": "audio/wav", "cache-control": "no-store" },
        });
      } catch {
        return new Response("The Tree could not speak.", { status: 503 });
      }
    },
  } },
});
