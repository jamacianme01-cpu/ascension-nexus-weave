import { createFileRoute } from "@tanstack/react-router";
import fs from "node:fs/promises";
import path from "node:path";
import { modelStorageObjectPath, verifyModelUploadSignature } from
  "@/lib/ascension/data/model-storage-signature.mjs";
import { validateGlbGeometry } from "@/lib/ascension/data/glb-geometry.mjs";

const BUCKET = "ascension-models";
const MAX_BYTES = 50 * 1024 * 1024;

function response(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function ownerStorageRoot(): string | null {
  const root = process.env["ASCENSION_STORAGE_DIR"]?.trim();
  return root && path.isAbsolute(root) ? root : null;
}

function contentType(objectPath: string): string {
  if (objectPath.endsWith(".glb")) return "model/gltf-binary";
  if (objectPath.endsWith(".png")) return "image/png";
  if (objectPath.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

export const Route = createFileRoute("/api/public/ascension/model-file")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const objectPath = url.searchParams.get("path");
        const relative = modelStorageObjectPath(objectPath);
        const root = ownerStorageRoot();
        if (!relative) return response({ error: "invalid_model_path" }, 400);
        if (!root) return response({ error: "owner_storage_unavailable" }, 503);
        try {
          const full = path.join(root, BUCKET, relative);
          const stat = await fs.stat(full);
          if (!stat.isFile() || stat.size > MAX_BYTES) return response({ error: "model_file_unavailable" }, 404);
          const bytes = await fs.readFile(full);
          return new Response(Uint8Array.from(bytes).buffer, {
            status: 200,
            headers: {
              "content-type": contentType(relative),
              "content-length": String(bytes.byteLength),
              "cache-control": "private, max-age=60",
              "x-content-type-options": "nosniff",
            },
          });
        } catch {
          return response({ error: "model_file_unavailable" }, 404);
        }
      },
      PUT: async ({ request }) => {
        const url = new URL(request.url);
        const objectPath = url.searchParams.get("path");
        const relative = modelStorageObjectPath(objectPath);
        const expires = url.searchParams.get("expires");
        const signature = url.searchParams.get("signature");
        const root = ownerStorageRoot();
        if (!relative || !relative.endsWith(".glb"))
          return response({ error: "invalid_model_path" }, 400);
        if (!root) return response({ error: "owner_storage_unavailable" }, 503);
        const secret = process.env["ASCENSION_PUBLISH_TOKEN"]?.trim() || "";
        if (!verifyModelUploadSignature(objectPath, expires, signature, secret))
          return response({ error: "invalid_model_upload_signature" }, 403);

        // Only the already-claimed owner worker job may use this capability.
        const parts = relative.split("/");
        if (parts.length !== 2 || !/^[a-f0-9-]{36}$/i.test(parts[0]!) ||
            !/^[a-f0-9-]{36}\.glb$/i.test(parts[1]!))
          return response({ error: "invalid_model_job_path" }, 400);
        const id = parts[1]!.slice(0, -4);
        const { ascensionDb } = await import("@/lib/ascension/data/client.server");
        const { data: job, error: dbError } = await ascensionDb
          .from("ascension_model_jobs")
          .select("request_id, status")
          .eq("id", id)
          .maybeSingle();
        if (dbError) return response({ error: "model_job_read_failed" }, 503);
        if (!job || job.request_id !== parts[0] || !["claimed", "running"].includes(job.status))
          return response({ error: "model_job_not_claimed" }, 409);

        const reported = Number(request.headers.get("content-length"));
        if (reported > MAX_BYTES) return response({ error: "model_too_large" }, 413);
        // Read in bounded chunks: a missing/false Content-Length cannot force
        // an unlimited in-memory upload before the size guard runs.
        if (!request.body) return response({ error: "model_body_missing" }, 400);
        const reader = request.body.getReader();
        const chunks: Uint8Array[] = [];
        let total = 0;
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > MAX_BYTES) {
              await reader.cancel();
              return response({ error: "model_too_large" }, 413);
            }
            chunks.push(value);
          }
        } catch {
          return response({ error: "model_upload_interrupted" }, 400);
        } finally {
          reader.releaseLock();
        }
        const bytes = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.byteLength;
        }
        if (!validateGlbGeometry(bytes))
          return response({ error: "invalid_glb_geometry" }, 422);
        const { error } = await ascensionDb.storage.from(BUCKET).upload(relative, bytes, {
          contentType: "model/gltf-binary", upsert: true,
        });
        if (error) return response({ error: "model_upload_failed" }, 503);
        return response({ ok: true }, 200);
      },
    },
  },
});
