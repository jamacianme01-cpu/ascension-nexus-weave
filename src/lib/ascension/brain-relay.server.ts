/**
 * Outbound-only bridge from the public ASCENSION interface to the owner's
 * designated brain PC. The PC polls this server; the cloud never opens a
 * socket to the user's LAN and never performs inference in brain-only mode.
 *
 * This small in-process queue is intentionally non-durable: a Railway restart
 * returns an error rather than pretending that an objective was processed.
 * A persistent queue requires storage configured by the owner.
 */
import { randomUUID, timingSafeEqual } from "node:crypto";

type JobReply = { status: number; body: unknown };
type Pending = {
  id: string;
  input: Record<string, unknown>;
  createdAt: number;
  claimedAt: number | null;
  resolve: (result: JobReply) => void;
  timeout: ReturnType<typeof setTimeout>;
};
const jobs = new Map<string, Pending>();
const queue: string[] = [];
// The browser can poll a long-running job instead of keeping one HTTP
// connection open until a small CPU model finishes four structured pathways.
const browserResults = new Map<string, {
  createdAt: number; result: JobReply | null;
}>();
const BROWSER_JOB_TIMEOUT = 20 * 60_000;
const BROWSER_RESULT_RETENTION = 25 * 60_000;
let lastPoll = 0;
function pruneBrowserResults() {
  const cutoff = Date.now() - BROWSER_RESULT_RETENTION;
  for (const [id, entry] of browserResults) {
    if (entry.createdAt < cutoff) browserResults.delete(id);
  }
}

export function remoteBrainEnabled(): boolean {
  return process.env["ASCENSION_REMOTE_BRAIN_ENABLED"] === "true";
}
export function isBrainOnline(): boolean {
  return remoteBrainEnabled() && (
    Date.now() - lastPoll < 20_000 ||
    [...jobs.values()].some(job => job.claimedAt !== null &&
      Date.now() - job.claimedAt < BROWSER_JOB_TIMEOUT)
  );
}
export function authenticateBrain(request: Request): boolean {
  const expected = process.env["ASCENSION_REMOTE_BRAIN_KEY"]?.trim() ?? "";
  const actual = request.headers.get("x-ascension-brain-key")?.trim() ?? "";
  if (expected.length < 48 || actual.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}
export function nextBrainJob(): { id: string; input: Record<string, unknown> } | null {
  lastPoll = Date.now();
  while (queue.length) {
    const id = queue.shift()!;
    const job = jobs.get(id);
    if (!job || job.claimedAt !== null) continue;
    job.claimedAt = Date.now();
    return { id, input: job.input };
  }
  return null;
}
export function returnBrainReply(id: string, status: number, body: unknown): boolean {
  const job = jobs.get(id);
  if (!job || job.claimedAt === null) return false;
  clearTimeout(job.timeout);
  jobs.delete(id);
  job.resolve({ status, body });
  return true;
}
export async function sendToBrain(input: Record<string, unknown>): Promise<JobReply> {
  if (!remoteBrainEnabled()) return { status: 503, body: { error: "ASCENSION older-computer mode is not enabled." } };
  if (!isBrainOnline()) return { status: 503, body: { error: "ASCENSION older computer is not connected. No hosted answer was substituted." } };
  if (jobs.size >= 16) return { status: 429, body: { error: "ASCENSION local brain queue is full." } };
  const id = randomUUID();
  return new Promise<JobReply>(resolve => {
    const timeout = setTimeout(() => {
      jobs.delete(id);
      resolve({ status: 504, body: { error: "The older computer did not finish the requested operation. No hosted answer was substituted." } });
    }, 105_000);
    jobs.set(id, { id, input, createdAt: Date.now(), claimedAt: null, resolve, timeout });
    queue.push(id);
  });
}

/**
 * Long-running PATHWAYS jobs are polled using an unguessable UUID. A CPU model
 * may need minutes; these requests must not hold a Railway/browser HTTP socket
 * or substitute fabricated fallback pathways.
 */
export function enqueueBrowserBrainJob(input: Record<string, unknown>): JobReply {
  pruneBrowserResults();
  if (!remoteBrainEnabled()) return { status: 503, body: { error: "ASCENSION older-computer mode is disabled." } };
  if (!isBrainOnline()) return { status: 503, body: { error: "ASCENSION older computer is not connected." } };
  if (jobs.size >= 8) return { status: 429, body: { error: "The older computer is busy processing other objectives." } };
  const id = randomUUID();
  browserResults.set(id, { createdAt: Date.now(), result: null });
  const timeout = setTimeout(() => {
    jobs.delete(id);
    const item = browserResults.get(id);
    if (item) item.result = {
      status: 504, body: { error: "The older computer did not complete pathways within twenty minutes. No substitute answer was generated." },
    };
  }, BROWSER_JOB_TIMEOUT);
  jobs.set(id, {
    id, input, createdAt: Date.now(), claimedAt: null, timeout,
    resolve: (result) => {
      const item = browserResults.get(id);
      if (item) item.result = result;
    },
  });
  queue.push(id);
  return { status: 202, body: { brain_job_id: id, status: "processing" } };
}

export function browserBrainJobResult(id: string): JobReply {
  pruneBrowserResults();
  if (!/^[a-f0-9-]{36}$/.test(id)) return { status: 400, body: { error: "Invalid ASCENSION job identifier." } };
  const entry = browserResults.get(id);
  if (!entry) return { status: 404, body: { error: "ASCENSION job no longer exists. Retry pathways." } };
  return entry.result ?? { status: 202, body: { status: "processing" } };
}
