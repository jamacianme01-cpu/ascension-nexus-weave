/**
 * Independent ASCENSION storage layer.
 * Replaces the removed Supabase admin client with a self-hosted object store.
 * Configure ASCENSION_STORAGE_DIR (local filesystem) or ASCENSION_STORAGE_BASE_URL
 * + ASCENSION_STORAGE_TOKEN for a remote store. No third-party platform required.
 */

import fs from "node:fs/promises";
import path from "node:path";

const STORAGE_DIR = process.env["ASCENSION_STORAGE_DIR"]?.trim() || ".ascension-storage";
const REMOTE_BASE = process.env["ASCENSION_STORAGE_BASE_URL"]?.trim() || "";
const REMOTE_TOKEN = process.env["ASCENSION_STORAGE_TOKEN"]?.trim() || "";

export const supabaseAdmin = {
  storage: {
    from(bucket: string) {
      return {
        async upload(
          filePath: string,
          bytes: Uint8Array,
          options?: { contentType?: string; upsert?: boolean },
        ): Promise<{ error: { message: string } | null } | { error: null } {
          try {
            if (REMOTE_BASE) {
              const url = `${REMOTE_BASE.replace(/\/$/, "")}/$/{bucket}/$/{filePath}`;
              const res = await fetch(url, {
                method: "PUT",
                headers: {
                  "Content-Type": options?.contentType || "application/octet-stream",
                  Authorization: REMOTE_TOKEN ? `Bearer ${REMOTE_TOKEN}` : "",
                },
                body: Buffer.from(bytes),
              });
              if (!res.ok) {
                return { error: { message: `remote storage upload failed: HTTP ${res.status}` } };
              }
              return { error: null };
            }
            const full = path.join(STORAGE_DIR, bucket, filePath);
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
          if (REMOTE_BASE) {
            return {
              data: {
                publicUrl: `${REMOTE_BASE.replace(/\/$/, "")}/$/{bucket}/$/{filePath}`,
              },
            };
          }
          const rel = path.join(bucket, filePath).split(path.sep).join("/");
          const base = process.env["ASCENSION_PUBLIC_BASE_URL"]?.replace(/\/$/, "") || "";
          return {
            data: {
              publicUrl: base ? `${base}/storage/$/{rel}` : `/storage/$/{rel}`,
            },
          };
        },
      };
    },
  },
};