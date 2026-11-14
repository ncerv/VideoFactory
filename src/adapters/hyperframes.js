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

/**
 * Verificación completa de HyperFrames (`hyperframes check --json`): lint, errores de ejecución,
 * encuadre, movimiento y "craft". El contraste WCAG se omite por defecto (escenas sin texto).
 */
export async function check(compositionDir, { contrast = false, samples = 9 } = {}) {
  const args = ["check", ".", "--json", `--samples=${samples}`];
  if (!contrast) args.push("--no-contrast");
  const { code, output } = await runHyperframes(args, { cwd: compositionDir });
  let result = null;
  try {
    result = JSON.parse(output.slice(output.indexOf("{")));
  } catch {
    /* salida no JSON */
  }
  return { ok: code === 0 && Boolean(result?.ok), result, output: result ? null : output };
}

/**
 * Fotogramas en instantes concretos con `hyperframes snapshot --at … --no-end --json`.
 * HyperFrames escribe los PNG y sus propias hojas de contacto rotuladas.
 * @returns {{ ok, frames:[{path,time}], contactSheets:[path], output? }}
 */
export async function snapshot(compositionDir, { at, outputDir }) {
  const args = ["snapshot", ".", "--at", at.join(","), "--no-end", "-o", path.resolve(outputDir), "--json"];
  const { code, output } = await runHyperframes(args, { cwd: compositionDir });
  let result = null;
  try {
    result = JSON.parse(output.slice(output.indexOf("{")));
  } catch {
    /* salida no JSON */
  }
  return { ok: code === 0 && Boolean(result?.ok), frames: result?.frames ?? [], contactSheets: result?.contactSheets ?? [], output: result ? null : output };
}

/**
 * Renderiza una composición a MP4 con `hyperframes render`.
 * quality: draft | looks (CRF 16, por defecto) | delivery; workers: número o "auto";
 * fps: frecuencia de salida (1-240; por defecto la de la composición). Solo para vistas previas.
 */
export function render({ compositionDir, outputFile, entry = null, quality = null, workers = null, fps = null, stdio = "pipe" }) {
  const args = ["render", "-o", path.resolve(outputFile)];
  if (entry) args.push("-c", entry);
  if (quality) args.push("--quality", quality);
  if (fps) args.push("--fps", String(fps));
  if (workers) args.push("--workers", String(workers));
  return runHyperframes(args, { cwd: compositionDir, stdio });
}

/**
 * Copia GSAP (dependencia npm fijada) a <compositionDir>/vendor/gsap.min.js.
 * Las composiciones cargan GSAP de forma local: no dependen de CDNs, que pueden
 * estar bloqueados (como cdn.jsdelivr.net en el entorno remoto) o no estar disponibles sin conexión.
 */
export function vendorGsap(compositionDir) {
  const src = require.resolve("gsap/dist/gsap.min.js", { paths: [REPO_ROOT] });
  const pkg = JSON.parse(fs.readFileSync(require.resolve("gsap/package.json", { paths: [REPO_ROOT] }), "utf8"));
  const destDir = path.join(compositionDir, "vendor");
  fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, "gsap.min.js");
  // Copia íntegra: conserva la cabecera @license original del archivo.
  fs.copyFileSync(src, dest);
  // Aviso de licencia explícito junto a la copia.
  fs.writeFileSync(
    path.join(destDir, "gsap.LICENSE.txt"),
    [
      `GSAP ${pkg.version} (${pkg.homepage})`,
      "Copyright GreenSock. Todos los derechos reservados.",
      `Licencia: ${pkg.license}`,
      "Copia local generada por VideoFactory desde el paquete npm `gsap` (sin modificaciones).",
      "",
    ].join("\n"),
  );
  return dest;
}
