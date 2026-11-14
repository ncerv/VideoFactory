// `vf build`: genera la composición HyperFrames de un proyecto a partir de su scene.js y timing.json.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { vendorGsap } from "../adapters/hyperframes.js";
import { paths } from "../orchestrator/paths.js";
import { createRng } from "./prng.js";
import { rootFile, sceneFile } from "./composition.js";

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

/**
 * Construye build/ (o rendering.buildDir): index.html, compositions/<escena>.html y vendor/.
 * @param options.buildDir carpeta de salida alternativa (p. ej. temporal en pruebas)
 * @returns {{ buildDir, entry, files, scene, ms }}
 */
export async function buildProject(projectDir, { buildDir: buildDirOverride = null } = {}) {
  const t0 = performance.now();
  const { dir, project, timing, buildScene } = await loadSceneProject(projectDir);
  const { width, height, fps } = project.output;
  const duration = timing.duration;
  if (!(duration > 0)) throw new Error("timing.json debe definir duration (segundos)");
  if (timing.fps && timing.fps !== fps) throw new Error(`timing.fps (${timing.fps}) no coincide con output.fps (${fps})`);

  const scene = buildScene({ width, height, fps, duration, timing, rng: createRng(timing.seed ?? 1), project });
  const sceneDef = { width, height, duration, ...scene };

  const buildDir = buildDirOverride ? path.resolve(buildDirOverride) : path.join(dir, project.rendering.buildDir ?? "build");
  fs.rmSync(buildDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(buildDir, "compositions"), { recursive: true });

  const files = {
    "index.html": rootFile({ title: project.title, width, height, fps, duration, background: scene.background || "#000", scenes: [{ id: scene.id, start: 0, duration }] }),
    [`compositions/${scene.id}.html`]: sceneFile(sceneDef),
  };
  for (const [rel, content] of Object.entries(files)) fs.writeFileSync(path.join(buildDir, rel), content);

  vendorGsap(buildDir);
  for (const [name, src] of Object.entries(RUNTIME_FILES)) fs.copyFileSync(src, path.join(buildDir, "vendor", name));

  return { buildDir, entry: path.join(buildDir, "index.html"), files: Object.keys(files), scene: sceneDef, ms: performance.now() - t0 };
}
