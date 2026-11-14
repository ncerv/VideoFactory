// `vf preview`: revisión visual económica, separada del render final.
//
// Capacidades usadas (comprobadas en HyperFrames 0.8.229):
//  - `hyperframes snapshot --at t1,t2,…` captura instantes exactos y genera hojas de contacto;
//  - `hyperframes render --quality draft --fps N` codifica rápido y a menor frecuencia.
// HyperFrames no puede renderizar por debajo de la resolución de la composición
// (`--resolution` solo multiplica), así que la escala reducida la genera VideoFactory:
// una construcción aparte (build-preview/, 540×960) con la misma escena en coordenadas lógicas.
//
// No ejecuta `hyperframes check`, ni ffprobe, ni la verificación de entrega: eso es `vf render`.
import fs from "node:fs";
import path from "node:path";
import { render, snapshot } from "../adapters/hyperframes.js";
import { validateProject } from "../validation/project.js";
import { buildProject } from "./build.js";
import { evenTimes } from "./contact-sheet.js";

export const PREVIEW_DEFAULTS = { scale: 0.5, frames: 8, fps: 15, quality: "draft" };
const seconds = (ms) => Math.round(ms) / 1000;

/** Instantes a revisar: --at explícito, timing.preview.at de la escena, o N repartidos uniformemente. */
export function previewTimes({ at, timing, duration, fps, frames }) {
  const list = at?.length ? at : timing?.preview?.at?.length ? timing.preview.at : evenTimes(duration, fps, frames);
  const last = Math.floor(((Math.round(duration * fps) - 1) / fps) * 1000) / 1000; // último fotograma, a la baja
  return [...new Set(list.map((t) => Math.round(Math.min(Math.max(0, Number(t)), last) * 1000) / 1000))].sort((a, b) => a - b);
}

/**
 * @param o { scale, frames, at:[s], video, fps, onStep }
 * @returns resumen con rutas y tiempos (también en output/preview/preview.json)
 */
export async function previewProject(projectDir, { scale = PREVIEW_DEFAULTS.scale, frames = PREVIEW_DEFAULTS.frames, at = null, video = false, fps = PREVIEW_DEFAULTS.fps, onStep = () => {} } = {}) {
  const t0 = performance.now();
  const timings = {};
  const step = async (name, fn) => {
    onStep(name);
    const s = performance.now();
    const r = await fn();
    timings[name] = seconds(performance.now() - s);
    return r;
  };

  const validation = validateProject(projectDir);
  if (!validation.ok) throw Object.assign(new Error("El proyecto no es válido"), { validation });
  const project = validation.project;
  const build = await step("build", () => buildProject(projectDir, { scale }));
  const duration = build.scene.duration;
  const timing = JSON.parse(fs.readFileSync(path.join(path.resolve(projectDir), project.rendering.timing ?? "timing.json"), "utf8"));

  const outDir = path.join(path.resolve(projectDir), "output", "preview");
  fs.mkdirSync(outDir, { recursive: true });
  const summary = {
    project: project.id,
    buildHash: build.hash,
    buildCached: build.cached,
    size: `${build.output.width}x${build.output.height}`,
    mode: video ? "video" : "frames",
  };

  if (video) {
    const file = path.join(outDir, "preview.mp4");
    const r = await step("render", () => render({ compositionDir: build.buildDir, outputFile: file, quality: PREVIEW_DEFAULTS.quality, fps }));
    if (r.code !== 0) throw Object.assign(new Error("hyperframes render (vista previa) falló"), { output: r.output });
    Object.assign(summary, { video: path.relative(projectDir, file), fps, quality: PREVIEW_DEFAULTS.quality });
  } else {
    const times = previewTimes({ at, timing, duration, fps: project.output.fps, frames });
    const framesDir = path.join(outDir, "frames");
    const r = await step("snapshot", () => snapshot(build.buildDir, { at: times, outputDir: framesDir }));
    if (!r.ok) throw Object.assign(new Error("hyperframes snapshot falló"), { output: r.output });
    Object.assign(summary, {
      times,
      frames: r.frames.map((f) => path.relative(projectDir, f.path)),
      contactSheets: r.contactSheets.map((f) => path.relative(projectDir, f)),
    });
  }
  summary.timings = { ...timings, total: seconds(performance.now() - t0) };
  fs.writeFileSync(path.join(outDir, "preview.json"), `${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}
