// Adaptador de HyperFrames: motor visual y de composición 2D de VideoFactory.
// Invoca la CLI `hyperframes` instalada en node_modules (versión fijada en package.json).
// No reimplementa el render: HyperFrames gestiona Chromium y FFmpeg internamente.
import { spawn } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { REPO_ROOT } from "../orchestrator/paths.js";

const require = createRequire(import.meta.url);

/** Entorno para HyperFrames: sin telemetría y sin publicación implícita. */
export function hyperframesEnv(extra = {}) {
  return { ...process.env, HYPERFRAMES_NO_TELEMETRY: "1", DO_NOT_TRACK: "1", ...extra };
}

/** Ruta del binario JS de la CLI de HyperFrames, o null si no está instalada. */
export function resolveCli() {
  try {
    const pkgPath = require.resolve("hyperframes/package.json", { paths: [REPO_ROOT] });
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    const rel = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.hyperframes;
    return { version: pkg.version, cli: path.join(path.dirname(pkgPath), rel) };
  } catch {
    return null;
  }
}

/** Ejecuta la CLI de HyperFrames con Node (portable: no depende de shims .cmd ni de npx). */
export function runHyperframes(args, { cwd = REPO_ROOT, env = {}, stdio = "pipe" } = {}) {
  const resolved = resolveCli();
  if (!resolved) return Promise.reject(new Error("HyperFrames no está instalado: ejecuta `npm install`."));
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [resolved.cli, ...args], {
      cwd,
      env: hyperframesEnv(env),
      stdio: stdio === "inherit" ? ["ignore", "inherit", "inherit"] : ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let out = "";
    child.stdout?.on("data", (d) => (out += d));
    child.stderr?.on("data", (d) => (out += d));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, output: out }));
  });
}

/** Valida una composición con `hyperframes lint --json`. */
export async function lint(compositionDir) {
  const { code, output } = await runHyperframes(["lint", compositionDir, "--json"]);
  const start = output.indexOf("{");
  let result = null;
  try {
    result = JSON.parse(output.slice(start));
  } catch {
    /* salida no JSON */
  }
  return { ok: code === 0, result, output };
}

/** Renderiza una composición a MP4 con `hyperframes render`. */
export function render({ compositionDir, outputFile, entry = null, stdio = "pipe" }) {
  const args = ["render", "-o", path.resolve(outputFile)];
  if (entry) args.push("-c", entry);
  return runHyperframes(args, { cwd: compositionDir, stdio });
}

/**
 * Copia GSAP (dependencia npm fijada) a <compositionDir>/vendor/gsap.min.js.
 * Las composiciones cargan GSAP de forma local: no dependen de CDNs, que pueden
 * estar bloqueados (como cdn.jsdelivr.net en el entorno remoto) o no estar disponibles sin conexión.
 */
export function vendorGsap(compositionDir) {
  const src = require.resolve("gsap/dist/gsap.min.js", { paths: [REPO_ROOT] });
  const destDir = path.join(compositionDir, "vendor");
  fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, "gsap.min.js");
  fs.copyFileSync(src, dest);
  return dest;
}
