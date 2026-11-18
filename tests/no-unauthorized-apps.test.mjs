import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, extname } from "node:path";
import test from "node:test";

/**
 * ASCENSION V1 may integrate only the owner's original runtime and approved
 * model contributions. This checks ACTIVE application source, not historical
 * migrations preserved under docs/archive.
 */
function files(dir, all = []) {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const pathname = join(dir, item.name);
    if (item.isDirectory()) files(pathname, all);
    else if ([".ts", ".tsx", ".js", ".mjs"].includes(extname(item.name))) all.push(pathname);
  }
  return all;
}

test("active ASCENSION application cannot import or configure removed apps", () => {
  const forbidden = [
    /@lovable[.]dev/i, /ai[.]gateway[.]lovable[.]dev/i,
    /api[.]z[.]ai/i, /openrouter[.]ai/i,
    /@\/integrations\/supabase/i,
    /\b(?:LOVABLE|ZAI|OPENROUTER|SUPABASE)_[A-Z_]+\b/,
  ];
  const errors = [];
  for (const pathname of [...files("src"), ...files("scripts")]) {
    const text = readFileSync(pathname, "utf8");
    for (const pattern of forbidden) if (pattern.test(text)) {
      errors.push(relative(".", pathname) + ": " + pattern.source);
    }
  }
  assert.deepEqual(errors, [], "Unauthorized app references must be fully removed");
});

test("native ASCENSION data code never creates a replacement database", () => {
  const pg = readFileSync("src/lib/ascension/data/postgres.server.ts", "utf8");
  assert.match(pg, /DATABASE_URL/);
  assert.doesNotMatch(pg, /CREATE\s+(?:DATABASE|TABLE)|TRUNCATE\s+TABLE/i);
  const meta = readFileSync("bunfig.toml", "utf8");
  assert.doesNotMatch(meta, /@lovable[.]dev|minimumReleaseAgeExcludes/);
});
