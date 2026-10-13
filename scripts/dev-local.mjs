import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadEnv } from "vite";

// Server secrets stay in the server process. Never put these in Vite's define
// object or give them a VITE_ prefix.
export function loadServerEnvironment(env, values) {
  for (const key of [
    "LOVABLE_API_KEY",
    "LOVABLE_AI_MODEL",
    "ZAI_API_KEY",
    "ZAI_MODEL",
    "ZAI_BASE_URL",
    "ASCENSION_ALLOW_PAID_DRAFTS",
    "ASCENSION_ALLOW_LOVABLE_AI",
    "ASCENSION_ALLOW_PAID_IMAGES",
    "LOCAL_LLM_BASE_URL",
    "LOCAL_LLM_MODEL",
    "SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ]) {
    if (!env[key] && values[key]) env[key] = values[key];
  }
  if (!env.SUPABASE_URL && values.VITE_SUPABASE_URL) env.SUPABASE_URL = values.VITE_SUPABASE_URL;
  if (!env.SUPABASE_PUBLISHABLE_KEY && values.VITE_SUPABASE_PUBLISHABLE_KEY)
    env.SUPABASE_PUBLISHABLE_KEY = values.VITE_SUPABASE_PUBLISHABLE_KEY;
}

async function startOllama() {
  if (process.platform !== "win32") return;
  const candidates = [
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Programs", "Ollama", "ollama.exe"),
    process.env.ProgramFiles && join(process.env.ProgramFiles, "Ollama", "ollama.exe"),
  ].filter(Boolean);
  const executable = candidates.find((path) => existsSync(path)) || "ollama";
  await new Promise((resolve) => {
    const child = spawn(executable, ["serve"], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.once("error", () => resolve());
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

function installedModelName(requested, names) {
  const name = requested?.trim();
  if (!name) return undefined;
  if (names.includes(name)) return name;
  // An untagged Ollama model refers to its :latest tag. Keep explicit tags
  // exact so a missing version never silently selects a different model.
  if (!name.split("/").at(-1).includes(":")) {
    const tagged = `${name}:latest`;
    if (names.includes(tagged)) return tagged;
  }
  return undefined;
}

export async function connectAnswerEngine(
  env,
  {
    request = fetch,
    start = startOllama,
    pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  } = {},
) {
  // A configured API key is not approval to bill inference. Explicit local
  // configuration always wins; hosted providers require owner opt-in.
  if (!env.LOCAL_LLM_BASE_URL?.trim()) {
    if (env.ASCENSION_ALLOW_LOVABLE_AI === "true" && env.LOVABLE_API_KEY?.trim())
      return "configured Lovable AI";
    if (env.ASCENSION_ALLOW_PAID_DRAFTS === "true" && env.ZAI_API_KEY?.trim())
      return "configured Z.AI";
  }

  if (env.LOCAL_LLM_BASE_URL?.trim()) {
    const url = env.LOCAL_LLM_BASE_URL.replace(/\/+$/, "");
    let response;
    try {
      response = await request(`${url}/models`, { signal: AbortSignal.timeout(5000) });
    } catch {
      if (!/^http:\/\/(127\.0\.0\.1|localhost):11434\/v1$/.test(url))
        throw new Error(
          "The configured local answer engine is unreachable. Start that engine and run this command again.",
        );
      await start();
      for (let attempt = 0; attempt < 6 && !response; attempt++) {
        await pause(1000);
        try {
          response = await request(`${url}/models`, { signal: AbortSignal.timeout(2000) });
        } catch {}
      }
    }
    if (!response) throw new Error("The configured local answer engine did not start.");
    if (!response.ok)
      throw new Error(`Configured local answer engine returned HTTP ${response.status}.`);
    const installed = (await response.json()).data;
    const chosen = installedModelName(
      env.LOCAL_LLM_MODEL || "qwen3:4b",
      Array.isArray(installed) ? installed.map((model) => model.id) : [],
    );
    if (!chosen)
      throw new Error("The configured answer model is not available from the local engine.");
    env.LOCAL_LLM_MODEL = chosen;
    return `local model ${chosen}`;
  }

  let models;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const response = await request("http://127.0.0.1:11434/api/tags", {
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok) {
        models = (await response.json()).models;
        break;
      }
    } catch {
      /* Start the existing local engine below; no model downloads. */
    }
    if (attempt === 0) await start();
    await pause(1000);
  }
  if (!Array.isArray(models))
    throw new Error(
      "No local answer engine is reachable. Open https://ascensionweave.app to use the hosted engine, or start your installed Ollama engine and run this command again.",
    );
  const names = models.map((model) => model.name);
  const requested =
    env.LOCAL_LLM_MODEL ||
    ["qwen3-ascension:latest", "qwen3-ascension", "qwen3:4b"].find((name) =>
      names.includes(name),
    ) ||
    names.find(
      (name) => /^(qwen|llama|gemma|mistral|phi|deepseek)/i.test(name) && !/embed/i.test(name),
    );
  const chosen = installedModelName(requested, names);
  if (!chosen)
    throw new Error(
      "Ollama is running, but the required answer model is not installed. No model was downloaded. Use https://ascensionweave.app for the hosted engine.",
    );
  env.LOCAL_LLM_BASE_URL = "http://127.0.0.1:11434/v1";
  env.LOCAL_LLM_MODEL = chosen;
  return `local model ${chosen}`;
}

async function main() {
  loadServerEnvironment(process.env, loadEnv("development", process.cwd(), ""));
  const engine = await connectAnswerEngine(process.env);
  console.log(`ASCENSION: using ${engine}. Starting the app…`);
  const child = spawn(
    process.execPath,
    [
      fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url)),
      "--host",
      "127.0.0.1",
      "--port",
      "4174",
      "--strictPort",
      "--open",
    ],
    { stdio: "inherit", env: process.env },
  );
  child.once("error", (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  child.once("exit", (code) => {
    process.exitCode = code ?? 0;
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`ASCENSION: ${error.message}`);
    process.exitCode = 1;
  });
}
