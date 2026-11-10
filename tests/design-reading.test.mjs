import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const dir = await mkdtemp(join(tmpdir(), "design-reading-"));
const outfile = join(dir, "render.js");
await build({
  stdin: {
    contents: `
      import { renderToStaticMarkup } from "react-dom/server";
      import { DesignedFlow } from "./src/components/ascension/designed-flow.tsx";
      const objective = "worker drones for people with dementia";
      const html = renderToStaticMarkup(
        <DesignedFlow
          screen="spiral"
          objective={objective}
          choice={0}
          talking={true}
          onToggleTalking={() => {}}
          onScreen={() => {}}
          onOpen={() => {}}
          readings={[
            {
              title: "Companion drone for people with dementia",
              line: "A small indoor drone that stays with a person who has dementia and calls for help.",
              parts: [
                { name: "Quiet companion body", purpose: "Stays near the person without startling them.", location: "At shoulder height in the room" },
                { name: "Familiar-face recall", purpose: "Shows family when the person is confused.", location: "On the front of the drone" },
              ],
            },
            { title: "Night-watch drone for dementia care", line: "Watches the hallway at night for a person with dementia.", parts: [] },
            { title: "Family-link drone for dementia", line: "Connects the person with dementia to a named family member.", parts: [] },
            { title: "Blend for dementia care", line: "Keeps the companion, the night watch, and the family link in one reading.", blend: true, parts: [] },
          ]}
        />,
      );
      process.stdout.write(html);
    `,
    resolveDir: process.cwd(),
    loader: "tsx",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile,
  jsx: "automatic",
  plugins: [{
    name: "css-empty",
    setup(build) {
      build.onLoad({ filter: /\.css$/ }, () => ({ contents: "export default {}", loader: "js" }));
    },
  }],
});

const rendered = spawnSync(process.execPath, [outfile], { encoding: "utf8" });
if (rendered.status !== 0) {
  console.error(rendered.stderr);
  process.exit(rendered.status ?? 1);
}
const html = rendered.stdout;
assert.match(html, /worker drones for people with dementia/);
assert.match(html, /Companion drone for people with dementia/);
assert.match(html, /Night-watch drone for dementia care/);
assert.match(html, /Family-link drone for dementia/);
assert.match(html, /Blend for dementia care/);
assert.match(html, /Quiet companion body/);
assert.match(html, /people with dementia/);
assert.doesNotMatch(html, /\/designed-flow\//);

const route = await readFile("src/routes/api/public/ascension/independent.ts", "utf8");
assert.match(route, /kind: "design-reading"/);
assert.doesNotMatch(route, /own image-generation engine is not yet connected/);
assert.match(route, /callZai\(/);
const engage = await readFile("src/components/ascension/independent-engage.tsx", "utf8");
assert.doesNotMatch(engage, /phase: "initial"/);
assert.match(engage, /objective=\{objective\.trim\(\)\}/);

const css = await readFile("src/components/ascension/designed-flow.css", "utf8");
await writeFile("/tmp/wow-board.html", `<!doctype html><meta charset="utf-8"><title>Design reading</title><style>body{margin:0}${css}</style>${html}`);
console.log("PASS design reading keeps the user's sentence with the four pathways");
