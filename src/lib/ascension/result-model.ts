/** Consumer projections of recorded runs. No projection awards verification. */
export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

export function branchTitle(value: unknown): string {
  const b = record(value);
  const names: Record<string, string> = {
    single_pass_construct: "Create in one pass",
    staged_construct: "Build and check in stages",
    minimal_seeded_construct: "Start with a small working seed",
  };
  return (
    names[String(b["approach"])] ??
    String(
      b["pathway"] ??
        b["name"] ??
        b["approach"] ??
        b["branch_id"] ??
        b["id"] ??
        "Published pathway",
    )
  );
}

export function planningFor(result: unknown) {
  const p = record(record(result)["objective_planning"]);
  const branches = Array.isArray(p["branches"]) ? p["branches"].map(record) : [];
  const selected = record(p["selected_branch"]);
  return {
    branches,
    selected,
    elements: Array.isArray(p["meaning_elements"]) ? p["meaning_elements"].map(record) : [],
  };
}

export function governedPersisted(run: {
  engine?: string | null;
  status: string;
  result: unknown;
}): boolean {
  const r = record(run.result);
  return (
    run.engine === "governed_runtime" &&
    run.status === "verified" &&
    r["transaction"] === "PERSISTED" &&
    r["autosync_verdict"] === "VERIFIED" &&
    record(r["publication"])["delta_in_persisted_ledger"] === true
  );
}

export function receiptFiles(
  result: unknown,
): { name: string; bytes: number | null; sha256: string | null }[] {
  const receipts = record(result)["execution_receipts"];
  if (!Array.isArray(receipts)) return [];
  return receipts.flatMap((r) => {
    const files = record(r)["files"];
    return Array.isArray(files)
      ? files.map((file) => {
          const f = record(file);
          return {
            name:
              typeof f["path"] === "string"
                ? f["path"].split(/[\\/]/).at(-1)!
                : "Recorded artifact",
            bytes: typeof f["bytes"] === "number" ? f["bytes"] : null,
            sha256: typeof f["sha256"] === "string" ? f["sha256"] : null,
          };
        })
      : [];
  });
}

export interface ObjectiveDelivery {
  kind: "answer" | "recommendation" | "artifact";
  title: string;
  body: string;
  files: { name: string; content: string }[];
  limitations: string[];
}

/** Validate external output before displaying or offering it for download. */
export function parseDelivery(value: unknown): ObjectiveDelivery {
  const v = record(value);
  if (
    !["answer", "recommendation", "artifact"].includes(String(v["kind"])) ||
    typeof v["title"] !== "string" ||
    !v["title"].trim() ||
    v["title"].length > 200 ||
    typeof v["body"] !== "string" ||
    !v["body"].trim() ||
    v["body"].length > 40000 ||
    !Array.isArray(v["files"]) ||
    v["files"].length > 8 ||
    !Array.isArray(v["limitations"]) ||
    v["limitations"].some((x) => typeof x !== "string")
  ) {
    throw new Error("The answer engine returned an incomplete result. Retry this result.");
  }
  const names = new Set<string>();
  const files = v["files"].map((raw) => {
    const f = record(raw);
    if (
      typeof f["name"] !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(f["name"]) ||
      f["name"].includes("..") ||
      names.has(f["name"].toLowerCase()) ||
      typeof f["content"] !== "string" ||
      !f["content"].trim() ||
      f["content"].length > 100000
    ) {
      throw new Error("The answer engine returned an invalid file.");
    }
    names.add(f["name"].toLowerCase());
    return { name: f["name"], content: f["content"] };
  });
  if (v["kind"] === "artifact" && !files.length)
    throw new Error("The created result did not include a file.");
  return {
    kind: v["kind"] as ObjectiveDelivery["kind"],
    title: v["title"],
    body: v["body"],
    files,
    limitations: v["limitations"] as string[],
  };
}
