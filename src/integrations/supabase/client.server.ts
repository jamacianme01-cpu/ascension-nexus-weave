/**
 * Independent ASCENSION storage layer.
 * Replaces the removed Supabase admin client with a self-hosted object store.
 * Configure ASCENSION_STORAGE_DIR (local filesystem) or ASCENSION_STORAGE_BASE_URL
 * + ASCENSION_STORAGE_TOKEN for a remote store. No third-party platform required.
 *
 * Table and RPC calls fail closed. This build does not connect a hosted database.
 */

import fs from "node:fs/promises";
import path from "node:path";

const STORAGE_DIR = process.env["ASCENSION_STORAGE_DIR"]?.trim() || ".ascension-storage";
const REMOTE_BASE = process.env["ASCENSION_STORAGE_BASE_URL"]?.trim() || "";
const REMOTE_TOKEN = process.env["ASCENSION_STORAGE_TOKEN"]?.trim() || "";
const OFFLINE = { message: "ASCENSION database is not connected.", code: "ASCENSION_DB_OFFLINE" };

interface Row {
  id: string;
  body: any;
  path: string;
  note: any;
  created_at: string;
  updated_at: string;
  result: any;
  objective: string;
  response_payload: any;
  status: string;
  request_id: string;
  http_status: number;
  evidence: any;
  constraints: any;
  label: string;
  revision: number;
  name: string;
  message: string;
  [key: string]: any;
}

type QueryResult<T> = {
  data: T | null;
  error: { message: string; code?: string } | null;
  count: number | null;
};

class Query<T = Row[]> implements PromiseLike<QueryResult<T>> {
  select(..._args: unknown[]) { return this; }
  insert(..._args: unknown[]) { return this; }
  update(..._args: unknown[]) { return this; }
  upsert(..._args: unknown[]) { return this; }
  delete(..._args: unknown[]) { return this; }
  eq(..._args: unknown[]) { return this; }
  neq(..._args: unknown[]) { return this; }
  gt(..._args: unknown[]) { return this; }
  gte(..._args: unknown[]) { return this; }
  lt(..._args: unknown[]) { return this; }
  lte(..._args: unknown[]) { return this; }
  in(..._args: unknown[]) { return this; }
  or(..._args: unknown[]) { return this; }
  not(..._args: unknown[]) { return this; }
  is(..._args: unknown[]) { return this; }
  filter(..._args: unknown[]) { return this; }
  match(..._args: unknown[]) { return this; }
  order(..._args: unknown[]) { return this; }
  limit(..._args: unknown[]) { return this; }
  range(..._args: unknown[]) { return this; }
  contains(..._args: unknown[]) { return this; }
  single(): Query<Row> { return this as unknown as Query<Row>; }
  maybeSingle(): Query<Row> { return this as unknown as Query<Row>; }
  then<TResult1 = QueryResult<T>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve({ data: null, error: OFFLINE, count: null } as QueryResult<T>).then(onfulfilled, onrejected);
  }
}

function publicUrl(bucket: string, filePath: string): string {
  if (REMOTE_BASE) {
    return `${REMOTE_BASE.replace(/\/$/, "")}/${bucket}/${filePath}`;
  }
  const rel = path.join(bucket, filePath).split(path.sep).join("/");
  const base = process.env["ASCENSION_PUBLIC_BASE_URL"]?.replace(/\/$/, "") || "";
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
        if (REMOTE_BASE) {
          const url = publicUrl(bucketName(this), filePath);
          const res = await fetch(url, {
            method: "PUT",
            headers: {
              "Content-Type": options?.contentType || "application/octet-stream",
              ...(REMOTE_TOKEN ? { Authorization: `Bearer ${REMOTE_TOKEN}` } : {}),
            },
            body: Buffer.from(bytes),
          });
          if (!res.ok) return { error: { message: `remote storage upload failed: HTTP ${res.status}` } };
          return { error: null };
        }
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
    async list(_prefix?: string, _options?: { search?: string; limit?: number }): Promise<{
      data: Array<{ name: string }> | null;
      error: { message: string } | null;
    }> {
      return { data: [], error: null };
    },
    async createSignedUploadUrl(_filePath: string, _options?: { upsert?: boolean }): Promise<{
      data: { signedUrl: string } | null;
      error: { message: string } | null;
    }> {
      return { data: null, error: { message: "Signed uploads are not configured for this independent build." } };
    },
  };
}

const buckets = new WeakMap<object, string>();
function bucketName(api: object): string {
  return buckets.get(api) ?? "ascension";
}

export const supabaseAdmin = {
  from(_table: string) {
    return new Query();
  },
  async rpc(_name: string, _args?: Record<string, unknown>) {
    return { data: null, error: OFFLINE };
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
      return { data: null as { public: boolean } | null, error: null };
    },
    async createBucket(_bucket: string, _options?: Record<string, unknown>) {
      return { data: null, error: { message: "Object buckets are stored on the local filesystem; no remote bucket was created." } };
    },
    async updateBucket(_bucket: string, _options?: Record<string, unknown>) {
      return { data: null, error: { message: "Object bucket settings are not configurable in this independent build." } };
    },
  },
};
