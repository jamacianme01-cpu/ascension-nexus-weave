/**
 * Local-first ASCENSION desktop launcher. This binds all web and AI access to
 * the user's own loopback, not any retired personal computer or hosted worker.
 * If Python is absent, the Library Card still saves encrypted IndexedDB data.
 * Ollama is optional; the device AI process never installs it or downloads a
 * model without the user's action.
 */
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = new URL("../", import.meta.url);
const backend = fileURLToPath(new URL("./ascension-device-companion.py", import.meta.url));
const vite = fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url));
const processes = [];
let shuttingDown = false;

function child(command, args) {
  const task = spawn(command, args, {
    cwd: fileURLToPath(root),
    env: process.env,
    stdio: "inherit",
  });
  task.on("error", error => {
    if (!shuttingDown) console.error("ASCENSION local component: " + error.message);
  });
  processes.push(task);
  return task;
}
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const process of processes) {
    if (!process.killed) process.kill();
  }
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

const python = process.platform === "win32"
  ? { command: "py", args: ["-3"] }
  : { command: "python3", args: [] };

if (process.env.ASCENSION_DEVICE_COMPANION !== "false") {
  child(python.command, [...python.args, backend]);
}
console.log("ASCENSION LOCAL-FIRST: device Library Card at http://127.0.0.1:4174");
const app = child(process.execPath, [vite, "--host", "127.0.0.1", "--port", "4174", "--strictPort", "--open"]);
app.once("exit", code => {
  shutdown();
  if (typeof code === "number") process.exitCode = code;
});
