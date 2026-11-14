// `vf build`: genera la composición HyperFrames de un proyecto a partir de su scene.js y timing.json.
import { createHash } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { vendorGsap } from "../adapters/hyperframes.js";
import { paths } from "../orchestrator/paths.js";
import { createRng } from "./prng.js";
import { rootFile, scaledSize, sceneFile } from "./composition.js";

const require = createRequire(import.meta.url);
export const BUILD_META = ".vf-build.json";

export const RUNTIME_FILES = {
  "vf-textures.js": path.join(paths.library, "materials", "vf-textures.js"),
  "vf-motion.js": path.join(paths.library, "motion", "vf-motion.js"),
};

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/** Carga project.json, timing.json y el módulo de escena de un proyecto. */
export async function loadSceneProject(projectDir) {
  const dir = path.resolve(projectDir);
  const project = readJson(path.join(dir, "project.json"));
  const source = project.rendering.source;
  if (!source) throw new Error(`${project.id}: project.json no define rendering.source (módulo de escena)`);
  const timingFile = path.join(dir, project.rendering.timing ?? "timing.json");
  const timing = fs.existsSync(timingFile) ? readJson(timingFile) : {};
  const mod = await import(pathToFileURL(path.join(dir, source)).href);
  if (typeof mod.default !== "function") throw new Error(`${source} debe exportar por defecto una función de escena`);
  return { dir, project, timing, buildScene: mod.default };
}

/** Carpeta de construcción: build/ para producción, build-preview/ para vistas previas a escala reducida. */
export function defaultBuildDir(dir, project, scale) {
  const base = project.rendering.buildDir ?? "build";
  return path.join(dir, scale === 1 ? base : `${base}-preview`);
}

/** Lee los metadatos de una construcción anterior (hash de contenido), o null. */
export function readBuildMeta(buildDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(buildDir, BUILD_META), "utf8"));
  } catch {
    return null;
  }
}

/**
 * Construye build/ (o rendering.buildDir): index.html, compositions/<escena>.html y vendor/.
 * Si el contenido generado es idéntico al de la construcción anterior (mismo hash), no reescribe nada
 * y devuelve cached: true; así las etapas posteriores pueden reutilizar resultados ligados a ese hash.
 * @param options.buildDir carpeta de salida alternativa (p. ej. temporal en pruebas)
 * @param options.scale escala de salida (1 = producción 1080×1920; 0.5 = vista previa 540×960)
 * @param options.force reconstruir aunque el hash no haya cambiado
 * @returns {{ buildDir, entry, files, scene, hash, cached, scale, output, ms }}
 */
export async function buildProject(projectDir, { buildDir: buildDirOverride = null, scale = 1, force = false } = {}) {
  const t0 = performance.now();
  const { dir, project, timing, buildScene } = await loadSceneProject(projectDir);
  const { width, height, fps } = project.output;
  const duration = timing.duration;
  if (!(duration > 0)) throw new Error("timing.json debe definir duration (segundos)");
  if (timing.fps && timing.fps !== fps) throw new Error(`timing.fps (${timing.fps}) no coincide con output.fps (${fps})`);
  if (!(scale > 0 && scale <= 1)) throw new Error(`Escala no válida: ${scale}`);

  const scene = buildScene({ width, height, fps, duration, timing, rng: createRng(timing.seed ?? 1), project });
  const sceneDef = { width, height, duration, ...scene };
  const output = scaledSize(width, height, scale);

  const files = {
    "index.html": rootFile({ title: project.title, width: output.width, height: output.height, fps, duration, background: scene.background || "#000", scenes: [{ id: scene.id, start: 0, duration }] }),
    [`compositions/${scene.id}.html`]: sceneFile(sceneDef, { scale }),
  };
  const vendors = { "gsap.min.js": require.resolve("gsap/dist/gsap.min.js", { paths: [paths.root] }), ...RUNTIME_FILES };
  const hasher = createHash("sha256");
  for (const [rel, content] of Object.entries(files)) hasher.update(`${rel}\0${content}\0`);
  for (const [name, src] of Object.entries(vendors)) hasher.update(`${name}\0`).update(fs.readFileSync(src));
  const hash = hasher.digest("hex").slice(0, 16);

  const buildDir = buildDirOverride ? path.resolve(buildDirOverride) : defaultBuildDir(dir, project, scale);
  const result = { buildDir, entry: path.join(buildDir, "index.html"), files: Object.keys(files), scene: sceneDef, hash, scale, output };
  const previous = readBuildMeta(buildDir);
  const intact = previous?.hash === hash && [...Object.keys(files), ...Object.keys(vendors).map((n) => `vendor/${n}`)].every((rel) => fs.existsSync(path.join(buildDir, rel)));
  if (intact && !force) return { ...result, cached: true, ms: performance.now() - t0 };

  // La caché de check (.vf-check.json) vive dentro de buildDir y se descarta con la construcción.
  fs.rmSync(buildDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(buildDir, "compositions"), { recursive: true });
  for (const [rel, content] of Object.entries(files)) fs.writeFileSync(path.join(buildDir, rel), content);
  vendorGsap(buildDir);
  for (const [name, src] of Object.entries(RUNTIME_FILES)) fs.copyFileSync(src, path.join(buildDir, "vendor", name));
  fs.writeFileSync(path.join(buildDir, BUILD_META), `${JSON.stringify({ hash, scale, output, files: result.files }, null, 2)}\n`);
  return { ...result, cached: false, ms: performance.now() - t0 };
}
