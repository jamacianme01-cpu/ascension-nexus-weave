/**
 * ASCENSION-owned persistence. SQL uses native PostgreSQL from DATABASE_URL.
 * Object files use the owner's explicitly mounted ASCENSION_STORAGE_DIR.
 * Never create a replacement database or claim transient files are durable.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { Query, rpcDatabase } from "./postgres.server";
import { modelStorageObjectPath, modelUploadSignature } from "./model-storage-signature.mjs";

const STORAGE_DIR = process.env["ASCENSION_STORAGE_DIR"]?.trim() || "";

function publicUrl(bucket: string, filePath: string): string {
  const rel = path.join(bucket, filePath).split(path.sep).join("/");
  const base = process.env["ASCENSION_PUBLIC_BASE_URL"]?.replace(/\/$/, "") || "";
  if (bucket === "ascension-models" && modelStorageObjectPath(rel)) {
    const endpoint = "/api/public/ascension/model-file?path=" + encodeURIComponent(rel);
    return base ? base + endpoint : endpoint;
  }
  return base ? `${base}/storage/${rel}` : `/storage/${rel}`;
}

function bucketApi() {
  return {
    async upload(
      filePath: string,
      bytes: Uint8Array,
      options?: { contentType?: string; upsert?: boolean },
    ): Promise<{ error: { message: string } | null } | { error: null }> {
      try {
        if (!STORAGE_DIR || !path.isAbsolute(STORAGE_DIR))
          return { error: { message: "ASCENSION_STORAGE_DIR must be a mounted absolute persistent directory." } };
        if (filePath.split(/[\\/]/).includes("..") ||
            (bucketName(this) === "ascension-models" &&
             !modelStorageObjectPath("ascension-models/" + filePath)))
          return { error: { message: "Invalid stored file path." } };
        const full = path.join(STORAGE_DIR, bucketName(this), filePath);
        await fs.mkdir(path.dirname(full), { recursive: true });
        if (!options?.upsert) {
          try {
            await fs.access(full);
            return { error: { message: `file exists: ${filePath}` } };
          } catch {
            /* not exists, ok to write */
          }
        }
        await fs.writeFile(full, bytes);
        return { error: null };
      } catch (e) {
        return { error: { message: e instanceof Error ? e.message : String(e) } };
      }
    },
    getPublicUrl(filePath: string): { data: { publicUrl: string } } {
      return { data: { publicUrl: publicUrl(bucketName(this), filePath) } };
    },
    async list(prefix?: string, options?: { search?: string; limit?: number }): Promise<{
      data: Array<{ name: string }> | null;
      error: { message: string } | null;
    }> {
      const bucket = bucketName(this);
      if (bucket !== "ascension-models" || !STORAGE_DIR || !path.isAbsolute(STORAGE_DIR))
        return { data: null, error: { message: "Owner model storage is unavailable." } };
      if (prefix && !modelStorageObjectPath(bucket + "/" + prefix + "/index.png"))
        return { data: null, error: { message: "Invalid model list prefix." } };
      const folder = path.join(STORAGE_DIR, bucket, prefix || "");
      try {
        const files = await fs.readdir(folder, { withFileTypes: true });
        return { data: files.filter(entry => entry.isFile() &&
          !!modelStorageObjectPath(bucket + "/" + (prefix ? prefix + "/" : "") + entry.name) &&
          (!options?.search || entry.name.includes(options.search)))
          .slice(0, Math.min(1000, Math.max(1, options?.limit ?? 100)))
          .map(entry => ({ name: entry.name })), error: null };
      } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code === "ENOENT")
          return { data: [], error: null };
        return { data: null, error: { message: "Owner model listing failed." } };
      }
    },
    async createSignedUploadUrl(filePath: string, _options?: { upsert?: boolean; origin?: string }): Promise<{
      data: { signedUrl: string } | null;
      error: { message: string } | null;
    }> {
      const objectPath = bucketName(this) + "/" + filePath;
      const base = process.env["ASCENSION_PUBLIC_BASE_URL"]?.trim().replace(/\/$/, "") ||
        _options?.origin?.trim().replace(/\/$/, "") || "";
      const secret = process.env["ASCENSION_PUBLISH_TOKEN"]?.trim() || "";
      if (!modelStorageObjectPath(objectPath) || !objectPath.endsWith(".glb") ||
          !/^https:\/\/[^/]+/i.test(base) || !STORAGE_DIR || !path.isAbsolute(STORAGE_DIR))
        return { data: null, error: { message: "Owner model URL/storage is not configured." } };
      const expires = Date.now() + 2 * 60 * 60 * 1000;
      const signature = modelUploadSignature(objectPath, expires, secret);
      if (!signature)
        return { data: null, error: { message: "Model upload signing secret is not configured." } };
      const url = new URL(base + "/api/public/ascension/model-file");
      url.searchParams.set("path", objectPath);
      url.searchParams.set("expires", String(expires));
      url.searchParams.set("signature", signature);
      return { data: { signedUrl: url.toString() }, error: null };
    },
  };
}

const buckets = new WeakMap<object, string>();
function bucketName(api: object): string {
  return buckets.get(api) ?? "ascension";
}

export const ascensionDb = {
  from(table: string) {
    return new Query(table);
  },
  async rpc(name: string, args?: Record<string, unknown>) {
    return rpcDatabase(name, args);
  },
  auth: {
    async getUser(_token?: string) {
      return {
        data: { user: null as { id: string } | null },
        error: { message: "Sign-in is not configured for this independent build." },
      };
    },
    async getSession() {
      return { data: { session: null as { access_token: string } | null }, error: null };
    },
  },
  storage: {
    from(bucket: string) {
      const api = bucketApi();
      buckets.set(api, bucket);
      return api;
    },
    async getBucket(_bucket: string) {
      return { data: STORAGE_DIR && path.isAbsolute(STORAGE_DIR) ? {public:true} : null,
        error: STORAGE_DIR ? null : {message:"ASCENSION_STORAGE_DIR is not configured"} };
    },
    async createBucket(_bucket: string, _options?: Record<string, unknown>) {
      return { data: null, error: { message: "Persistent filesystem storage must be explicitly configured first." } };
    },
    async updateBucket(_bucket: string, _options?: Record<string, unknown>) {
      return { data: null, error: { message: "Object bucket settings are not configurable in this independent build." } };
    },
  },
};
