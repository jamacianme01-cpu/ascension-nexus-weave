/** A version slot stays pending until all four source-backed outputs exist.
 * This never interprets Guardian PASS or a persisted run as created artifacts. */
export function needsVersionCompletion(stage: unknown): boolean {
  if (!stage || typeof stage !== "object" || Array.isArray(stage)) return true;
  const record = stage as Record<string, unknown>;
  const versions = record["versions"];
  if (!Array.isArray(versions) || versions.length !== 4) return true;
  return versions.some((raw) =>
    !raw || typeof raw !== "object" || Array.isArray(raw) ||
    (raw as Record<string, unknown>)["status"] !== "created" ||
    !Array.isArray((raw as Record<string, unknown>)["files"]) ||
    ((raw as Record<string, unknown>)["files"] as unknown[]).length === 0
  );
}

import { createHash } from "node:crypto";

export type OutputVersion = {
  id: string;
  kind: "pathway" | "blend";
  label: string;
  summary: string;
  status: "created" | "unavailable";
  files: { name: string; content: string; bytes: number; sha256: string }[];
  verification_scope: string;
  blend_from: string[];
};

const clean = (s: unknown, max: number) => typeof s === "string" ? s.trim().slice(0, max) : "";

export function normalizeOutputVersions(
  source: unknown,
  allowedBranchIds: string[],
): { versions: OutputVersion[] } {
  if (!source || typeof source !== "object" || Array.isArray(source))
    throw new Error("Output versions require an object");
  const values = (source as Record<string, unknown>)["versions"];
  if (!Array.isArray(values) || values.length !== 4 || allowedBranchIds.length < 3)
    throw new Error("Exactly three governed pathways plus one blend are required");
  const branches = new Set(allowedBranchIds.slice(0, 3));
  if (branches.size !== 3) throw new Error("Expected three distinct governed pathway IDs");
  const seen = new Set<string>();
  const contents = new Set<string>();
  let blends = 0;
  let totalBytes = 0;
  const versions: OutputVersion[] = values.map((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("Invalid output version");
    const v = value as Record<string, unknown>;
    const id = clean(v["id"], 200);
    const kind = v["kind"];
    const label = clean(v["label"], 160);
    const summary = clean(v["summary"], 3000);
    const scope = clean(v["verification_scope"], 1000);
    const status = v["status"];
    if (!id || seen.has(id) || !label || !summary || !scope ||
        !["created", "unavailable"].includes(String(status)))
      throw new Error("Each output version requires a distinct ID, label, status and proof scope");
    if (kind === "blend") {
      blends++;
      if (index !== 3 || id !== "blend") throw new Error("Blend must be the fourth version");
    } else if (kind !== "pathway" || !branches.has(id) || index === 3) {
      throw new Error("Output variant does not match an actual governed pathway");
    }
    const blendFrom = Array.isArray(v["blend_from"]) &&
      v["blend_from"].every((item) => typeof item === "string")
      ? v["blend_from"] as string[] : [];
    const distinctBlendSources = new Set(blendFrom);
    if (kind === "blend" && (distinctBlendSources.size < 2 ||
        distinctBlendSources.size !== blendFrom.length || !blendFrom.every((x) => branches.has(x))))
      throw new Error("Blend must cite at least two distinct actual governed pathways without duplicates");
    if (kind === "pathway" && blendFrom.length)
      throw new Error("Only blend can have blend_from");
    const rawFiles = v["files"];
    if (!Array.isArray(rawFiles) || rawFiles.length > 8 ||
        (status === "created" && rawFiles.length === 0) ||
        (status === "unavailable" && rawFiles.length !== 0))
      throw new Error("Created versions must contain actual files; unavailable versions cannot");
    const files = rawFiles.map((raw): OutputVersion["files"][number] => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw))
        throw new Error("Invalid output file");
      const f = raw as Record<string, unknown>;
      const name = clean(f["name"], 120);
      const content = f["content"];
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(name) || name.includes("..") ||
          typeof content !== "string" || content.length < 1 || content.length > 100_000)
        throw new Error("Invalid output file name or body");
      const bytes = Buffer.byteLength(content, "utf8");
      totalBytes += bytes;
      if (totalBytes > 650_000) throw new Error("Output version payload exceeds transport limit");
      const digest = createHash("sha256").update(content, "utf8").digest("hex");
      if (f["sha256"] !== undefined && f["sha256"] !== "sha256:" + digest &&
          f["sha256"] !== digest) throw new Error("Output version hash mismatch");
      if (f["bytes"] !== undefined && f["bytes"] !== bytes)
        throw new Error("Output version byte count mismatch");
      return { name, content, bytes, sha256: "sha256:" + digest };
    });
    if (status === "created") {
      const primary = files.find((file) => !/^(README\.md|verification\.json|metadata\.json)$/i.test(file.name));
      if (!primary) throw new Error("Every produced version needs a substantive output");
      const signature = primary.sha256;
      if (contents.has(signature)) throw new Error("Duplicate output cannot count as a distinct version");
      contents.add(signature);
    }
    seen.add(id);
    return {
      id, kind: kind as OutputVersion["kind"], label, summary,
      status: status as OutputVersion["status"], files, verification_scope: scope,
      blend_from: blendFrom,
    };
  });
  if (blends !== 1 || ![...branches].every((id) => seen.has(id)))
    throw new Error("Three distinct governed branches and their blend must be represented");
  return { versions };
}
