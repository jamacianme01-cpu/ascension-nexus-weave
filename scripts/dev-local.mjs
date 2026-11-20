/**
 * ASCENSION local front-end development launcher.
 * Do not reconnect the owner's old computer or start external platform apps.
 * The owner-governed runtime may run locally or on an owner-controlled host.
 */
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadEnv } from "vite";

const SAFE_SERVER_KEYS = [
  "ASCENSION_DATABASE_URL",
  "DATABASE_URL",
  "ASCENSION_STORAGE_DIR",
  "ASCENSION_PUBLIC_BASE_URL",
  "ASCENSION_ENABLE_PAID_APIS",
  "ASCENSION_ALLOW_OPENAI_AI",
  "OPENAI_API_KEY",
  "ASCENSION_OPENAI_MODEL",
  "ASCENSION_PUBLISH_TOKEN",
  "ASCENSION_VOLUME_TRANSPORT_URL",
];

export function loadServerEnvironment(env, values) {
  for (const key of SAFE_SERVER_KEYS) {
    if (!env[key] && values[key]) env[key] = values[key];
  }
}

/** This launcher does not start inference on a Windows machine. */
export async function connectAnswerEngine(env) {
  if (env.ASCENSION_ENABLE_PAID_APIS === "true" &&
      env.ASCENSION_ALLOW_OPENAI_AI === "true" &&
      env.OPENAI_API_KEY?.trim()) return "owner-approved OpenAI";
  return env.ASCENSION_VOLUME_TRANSPORT_URL?.trim()
    ? "ASCENSION governed runtime (configured private transport)"
    : "ASCENSION governed runtime (transport not yet configured)";
}

async function main() {
  loadServerEnvironment(process.env, loadEnv("development", process.cwd(), ""));
  const engine = await connectAnswerEngine(process.env);
  console.log("ASCENSION: " + engine);
  const child = spawn(process.execPath, [
    fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url)),
    "--host", "127.0.0.1", "--port", "4174", "--strictPort", "--open",
  ], { stdio: "inherit", env: process.env });
  child.once("error", error => { console.error(error.message); process.exitCode = 1; });
  child.once("exit", code => { process.exitCode = code ?? 0; });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error("ASCENSION: " + error.message); process.exitCode = 1; });
}
