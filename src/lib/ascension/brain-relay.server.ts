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
let lastPoll = 0;

export function remoteBrainEnabled(): boolean {
  return process.env["ASCENSION_REMOTE_BRAIN_ENABLED"] === "true";
}
export function isBrainOnline(): boolean {
  return remoteBrainEnabled() && Date.now() - lastPoll < 20_000;
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
