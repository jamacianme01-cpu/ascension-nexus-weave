/**
 * ASCENSION's native PostgreSQL transport, using the existing database.
 * Does not initialize tables, create a replacement database, or alter governed state.
 * Requires DATABASE_URL / ASCENSION_DATABASE_URL as a private Fly secret.
 */
import postgres from "postgres";

export type DatabaseError = { message: string; code?: string };
type Result<T> = { data: T | null; error: DatabaseError | null; count: number | null };
type Row = {
  id: string; path: string; body: string; note: string;
  created_at: string; updated_at: string; result: any;
  objective: string; response_payload: any; status: string;
  request_id: string; http_status: number; evidence: any; constraints: any;
  label: string; revision: number; name: string; message: string;
  [key: string]: any;
};
const OFFLINE: DatabaseError = {
  message: "ASCENSION database connection is not configured on Fly (DATABASE_URL).",
  code: "ASCENSION_DB_NOT_CONFIGURED",
};
const connectionString = () => process.env["ASCENSION_DATABASE_URL"]?.trim() || process.env["DATABASE_URL"]?.trim() || "";
let connection: ReturnType<typeof postgres> | null = null;
function database() {
  const address = connectionString();
  if (!address) throw Object.assign(new Error(OFFLINE.message), { code: OFFLINE.code });
  if (!connection) connection = postgres(address, { max: 3, prepare: false, connect_timeout: 8, idle_timeout: 15 });
  return connection;
}
function identifier(value: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) throw new Error("Invalid database identifier");
  return '"' + value + '"';
}
function bind(params: unknown[], value: unknown): string {
  params.push(value);
  return "$" + params.length;
}
const jsonColumns = new Set([
  "evidence", "constraints", "result", "accepted_delta", "request_payload",
  "response_payload", "model_spec", "payload", "metadata", "properties",
]);
function columnValue(column: string, value: unknown): unknown {
  if (value === undefined) return null;
  if (jsonColumns.has(column) && value !== null) return JSON.stringify(value);
  return value;
}
function valueSql(params: unknown[], column: string, value: unknown): string {
  const placeholder = bind(params, columnValue(column, value));
  return jsonColumns.has(column) ? placeholder + "::jsonb" : placeholder;
}
function fields(columns: string): string {
  if (columns.trim() === "*") return "*";
  return columns.split(",").map(x => identifier(x.trim())).join(", ");
}
type Filter = { kind: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "is" | "contains" | "not"; column: string; value: unknown; operator?: string };

export class Query<T = Row[]> implements PromiseLike<Result<T>> {
  private action: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private projection = "*";
  private returning = false;
  private records: Record<string, unknown>[] = [];
  private filters: Filter[] = [];
  private sorts: { column: string; ascending: boolean }[] = [];
  private take: number | null = null;
  private offset = 0;
  private singleResult = false;
  private allowEmpty = false;
  private conflict = "id";
  private unsupported = "";
  constructor(private readonly table: string) {}
  select(columns = "*", _options?: Record<string, unknown>) { this.projection = columns; this.returning = this.action !== "select"; return this; }
  insert(input: Record<string, unknown> | Record<string, unknown>[]) { this.action = "insert"; this.records = Array.isArray(input) ? input : [input]; return this; }
  update(input: Record<string, unknown>) { this.action = "update"; this.records = [input]; return this; }
  upsert(input: Record<string, unknown> | Record<string, unknown>[], options?: { onConflict?: string }) {
    this.action = "upsert"; this.records = Array.isArray(input) ? input : [input];
    this.conflict = options?.onConflict || "id"; return this;
  }
  delete() { this.action = "delete"; return this; }
  eq(column: string, value: unknown) { this.filters.push({kind:"eq",column,value}); return this; }
  neq(column: string, value: unknown) { this.filters.push({kind:"neq",column,value}); return this; }
  gt(column: string, value: unknown) { this.filters.push({kind:"gt",column,value}); return this; }
  gte(column: string, value: unknown) { this.filters.push({kind:"gte",column,value}); return this; }
  lt(column: string, value: unknown) { this.filters.push({kind:"lt",column,value}); return this; }
  lte(column: string, value: unknown) { this.filters.push({kind:"lte",column,value}); return this; }
  in(column: string, value: unknown[]) { this.filters.push({kind:"in",column,value}); return this; }
  is(column: string, value: unknown) { this.filters.push({kind:"is",column,value}); return this; }
  not(column: string, operator: string, value: unknown) { this.filters.push({kind:"not",column,operator,value}); return this; }
  contains(column: string, value: unknown) { this.filters.push({kind:"contains",column,value}); return this; }
  or(_value: string) { this.unsupported = "Unsupported database OR filter; refusing to misquery the owner's records."; return this; }
  filter(column: string, operator: string, value: unknown) {
    if (["eq","neq","gt","gte","lt","lte","is"].includes(operator))
      this.filters.push({kind:operator as Filter["kind"],column,value});
    else this.unsupported = "Unsupported filter operator";
    return this;
  }
  match(conditions: Record<string, unknown>) { for (const [key,value] of Object.entries(conditions)) this.eq(key,value); return this; }
  order(column: string, options?: { ascending?: boolean }) { this.sorts.push({ column, ascending: options?.ascending !== false }); return this; }
  limit(value: number) { this.take = Math.max(0, Math.min(10000, value)); return this; }
  range(from: number, to: number) { this.offset = Math.max(0, from); this.take = Math.max(0,to-from+1); return this; }
  single(): Query<Row> { this.singleResult = true; this.allowEmpty = false; return this as unknown as Query<Row>; }
  maybeSingle(): Query<Row> { this.singleResult = true; this.allowEmpty = true; return this as unknown as Query<Row>; }
  private whereSql(params: unknown[]): string {
    if (!this.filters.length) return "";
    const statements = this.filters.map(f => {
      const key = identifier(f.column);
      if (f.kind === "is" || (f.value === null && (f.kind === "eq" || f.kind === "neq"))) {
        return key + (f.kind === "neq" ? " IS NOT NULL" : " IS NULL");
      }
      if (f.kind === "not") {
        if (f.operator === "is" && f.value === null) return key + " IS NOT NULL";
        throw new Error("Unsupported negative filter");
      }
      if (f.kind === "in") {
        if (!Array.isArray(f.value)) throw new Error("Invalid IN filter");
        return f.value.length ? key + " IN (" + f.value.map(x => bind(params,x)).join(",") + ")" : "FALSE";
      }
      if (f.kind === "contains") return key + " @> " + bind(params,JSON.stringify(f.value)) + "::jsonb";
      const op = {eq:"=",neq:"<>",gt:">",gte:">=",lt:"<",lte:"<="}[f.kind];
      if (!op) throw new Error("Unsupported database filter");
      return key + " " + op + " " + bind(params,f.value);
    });
    return " WHERE " + statements.join(" AND ");
  }
  private async execute(): Promise<Result<T>> {
    if (this.unsupported) return {data:null,error:{message:this.unsupported},count:null};
    if (!connectionString()) return {data:null,error:OFFLINE,count:null};
    try {
      const params: unknown[] = [];
      const tableName = "public." + identifier(this.table);
      const selected = fields(this.projection);
      let statement = "";
      if (this.action === "select") statement = "SELECT " + selected + " FROM " + tableName + this.whereSql(params);
      else if (this.action === "delete") {
        if (!this.filters.length) throw new Error("Refusing unfiltered delete");
        statement = "DELETE FROM " + tableName + this.whereSql(params);
      } else if (this.action === "update") {
        if (!this.filters.length) throw new Error("Refusing unfiltered update");
        const pairs = Object.entries(this.records[0] || {});
        if (!pairs.length) throw new Error("Empty update");
        statement = "UPDATE " + tableName + " SET " + pairs.map(([k,v]) => identifier(k)+"="+valueSql(params,k,v)).join(",") + this.whereSql(params);
      } else {
        if (!this.records.length) throw new Error("Empty insert");
        const keys = [...new Set(this.records.flatMap(x=>Object.keys(x)))];
        if (!keys.length) throw new Error("Empty insert");
        const rows = this.records.map(row=>"("+keys.map(k=>valueSql(params,k,row[k])).join(",")+")");
        statement = "INSERT INTO " + tableName + " (" + keys.map(identifier).join(",") + ") VALUES " + rows.join(",");
        if (this.action === "upsert") {
          const unique = this.conflict.split(",").map(x => identifier(x.trim()));
          const mutable = keys.filter(k => !this.conflict.split(",").map(x=>x.trim()).includes(k));
          statement += " ON CONFLICT (" + unique.join(",") + ") ";
          statement += mutable.length ? "DO UPDATE SET " + mutable.map(k=>identifier(k)+"=EXCLUDED."+identifier(k)).join(",") : "DO NOTHING";
        }
      }
      if (this.action === "select") {
        if (this.sorts.length) statement += " ORDER BY " + this.sorts.map(x=>identifier(x.column)+(x.ascending?" ASC":" DESC")).join(",");
        if (this.take !== null) statement += " LIMIT " + Math.floor(this.take);
        if (this.offset) statement += " OFFSET " + Math.floor(this.offset);
      } else if (this.returning) {
        statement += " RETURNING " + selected;
      }
      const rows = await database().unsafe(statement, params as any[]);
      if (this.singleResult) {
        if (rows.length > 1) return {data:null,error:{message:"Expected one database record"},count:null};
        if (rows.length === 0 && !this.allowEmpty) return {data:null,error:{message:"Database record not found",code:"PGRST116"},count:null};
        return {data:(rows[0] ?? null) as T,error:null,count:rows.length};
      }
      return {data:(this.action !== "select" && !this.returning ? null : rows) as T,error:null,count:rows.length};
    } catch (error) {
      const e = error as Error & { code?: string };
      return {data:null,error:{message:e.message,...(e.code ? {code:e.code} : {})},count:null};
    }
  }
  then<TResult1 = Result<T>, TResult2 = never>(
    onfulfilled?: ((value: Result<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> { return this.execute().then(onfulfilled,onrejected); }
}

export async function rpcDatabase(name: string, args: Record<string, unknown> = {}): Promise<Result<any>> {
  if (!connectionString()) return {data:null,error:OFFLINE,count:null};
  try {
    const params: unknown[] = [];
    const named = Object.entries(args).map(([k,v])=>identifier(k)+" => "+bind(params,v));
    const statement = "SELECT public."+identifier(name)+"("+named.join(",")+") AS payload";
    const rows = await database().unsafe(statement, params as any[]);
    return {data:rows[0]?.['payload'] ?? null,error:null,count:rows.length};
  } catch (error) {
    const e = error as Error & {code?:string};
    return {data:null,error:{message:e.message,...(e.code ? {code:e.code} : {})},count:null};
  }
}

export async function databaseConnectivity() {
  if (!connectionString()) return {connected:false,reason:"DATABASE_URL_NOT_CONFIGURED"};
  try {
    const rows = await database().unsafe(
      "SELECT to_regclass('public.ascension_execution_requests')::text AS queue, " +
      "to_regclass('public.ascension_run_stages')::text AS stages, " +
      "(SELECT count(distinct proname) FROM pg_proc WHERE pronamespace = 'public'::regnamespace " +
      "AND proname IN ('ascension_guest_submit','ascension_guest_status','ascension_guest_bundle','ascension_guest_draft')) AS rpc_count"
    );
    if (!rows[0]?.['queue'] || !rows[0]?.['stages'] || Number(rows[0]?.['rpc_count']) !== 4)
      return {connected:false,reason:"EXISTING_ASCENSION_SCHEMA_INCOMPLETE"};
    return {connected:true,reason:null};
  } catch {
    return {connected:false,reason:"DATABASE_CONNECTION_FAILED"};
  }
}
