// Etapas de entrega: `vf check` (hyperframes check), `vf render` (render final) y `vf verify` (verificación).
// Cada etapa reutiliza el trabajo anterior ligado al mismo hash de construcción:
//  - check: su resultado se guarda en <build>/.vf-check.json y vale mientras el hash no cambie;
//  - render: si el vídeo existente procede del mismo hash y los mismos ajustes, no se vuelve a renderizar.
// --force (force: true) rehace la etapa. Las comprobaciones de calidad de la entrega no se omiten nunca:
// lo que se reutiliza es un resultado ya obtenido para un contenido idéntico.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { check, render, resolveCli } from "../adapters/hyperframes.js";
import { validateProject } from "../validation/project.js";
import { buildProject } from "./build.js";
import { contactSheet, evenTimes } from "./contact-sheet.js";
import { auditExternalResources, checkContinuity, checkSpec, probeVideo } from "./verify.js";

export const CHECK_CACHE = ".vf-check.json";
const seconds = (ms) => Math.round(ms) / 1000;

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function summarizeCheck(result) {
  return Object.fromEntries(
    Object.entries(result ?? {})
      .filter(([, v]) => v && typeof v === "object" && Array.isArray(v.findings))
      .map(([k, v]) => [k, { errors: v.errorCount, warnings: v.warningCount, codes: v.findings.map((f) => f.code) }]),
  );
}

/**
 * `hyperframes check` sobre una construcción, con caché por hash.
 * @returns {{ ok, cached, summary, result? }}
 */
/** Un resultado de check en caché vale solo si fue correcto y procede del mismo contenido. */
export const checkCacheValid = (cached, build) => Boolean(cached && cached.ok === true && cached.hash === build.hash);

export async function checkBuild(build, { force = false } = {}) {
  const cacheFile = path.join(build.buildDir, CHECK_CACHE);
  const cached = readJson(cacheFile);
  if (!force && checkCacheValid(cached, build)) return { ok: true, cached: true, summary: cached.summary };
  const res = await check(build.buildDir);
  const summary = summarizeCheck(res.result);
  if (res.ok) fs.writeFileSync(cacheFile, `${JSON.stringify({ hash: build.hash, ok: true, summary }, null, 2)}\n`);
  return { ok: res.ok, cached: false, summary, result: res.result, output: res.output };
}

function outputDir(projectDir) {
  return path.join(path.resolve(projectDir), "output");
}

/**
 * Verificación de entrega de un MP4 ya renderizado: especificación (cabecera del contenedor),
 * fotogramas decodificados y continuidad (una sola decodificación), auditoría de recursos
 * y hoja de contacto rotulada.
 */
export async function verifyVideo({ projectDir, project, build, video, contactSheetFrames = 12, step }) {
  const { width, height, fps } = project.output;
  const duration = build.scene.duration;
  const expected = { width, height, fps, duration, frames: Math.round(duration * fps) };
  const probe = await step("probe", () => probeVideo(video));
  const continuity = await step("continuity", () => checkContinuity(video));
  const spec = checkSpec({ ...probe, decodedFrames: continuity.frames }, expected);
  const audit = auditExternalResources(build.buildDir);
  const sheet = await step("contactSheet", () =>
    contactSheet({ input: video, output: path.join(path.dirname(video), "contact-sheet.jpg"), times: evenTimes(duration, fps, contactSheetFrames), fps, columns: 4, thumbWidth: 360, thumbHeight: 640 }),
  );
  return { expected, probe, spec, continuity, audit, sheet, ok: spec.every((c) => c.ok) && continuity.ok && audit.ok };
}

function makeStepper(onStep) {
  const timings = {};
  const step = async (name, fn) => {
    onStep(name);
    const s = performance.now();
    const r = await fn();
    timings[name] = seconds(performance.now() - s);
    return r;
  };
  return { timings, step };
}

/**
 * Render final (1080×1920, fps del proyecto): valida → construye → check → render → verifica.
 * @param o { quality, workers, force, contactSheetFrames, onStep(name) }
 * @returns informe (también en output/render-report.json); cached: true si no hizo falta renderizar
 */
export async function renderProject(projectDir, { quality = "looks", workers = null, force = false, contactSheetFrames = 12, onStep = () => {} } = {}) {
  const t0 = performance.now();
  const { timings, step } = makeStepper(onStep);

  const validation = await step("validate", () => validateProject(projectDir));
  if (!validation.ok) throw Object.assign(new Error("El proyecto no es válido"), { validation });
  const project = validation.project;

  const build = await step("build", () => buildProject(projectDir, { force }));
  const outDir = outputDir(projectDir);
  const video = path.join(outDir, `${project.id}.mp4`);
  const reportFile = path.join(outDir, "render-report.json");
  const settings = { quality, workers: workers ?? "auto" };

  // Nada que hacer: el vídeo existente procede de esta misma construcción y ajustes, y se verificó bien.
  const previous = readJson(reportFile);
  if (
    !force &&
    previous?.ok &&
    previous.buildHash === build.hash &&
    previous.settings?.quality === settings.quality &&
    previous.settings?.workers === settings.workers &&
    fs.existsSync(video) &&
    fs.statSync(video).size === previous.probe?.sizeBytes
  ) {
    return { ...previous, cached: true, timings: { ...timings, total: seconds(performance.now() - t0) } };
  }

  const checked = await step("check", () => checkBuild(build, { force }));
  if (!checked.ok) throw Object.assign(new Error("hyperframes check encontró errores"), { check: checked });

  fs.mkdirSync(outDir, { recursive: true });
  const rendered = await step("render", () => render({ compositionDir: build.buildDir, outputFile: video, quality, workers }));
  if (rendered.code !== 0) throw Object.assign(new Error("hyperframes render falló"), { output: rendered.output });
  const lines = rendered.output.split(/\r?\n/).map((l) => l.trim());
  const renderSummary = lines.filter((l) => l && !l.startsWith("[") && !l.includes("█") && /rendered in|capture ·|cores detected/i.test(l));
  const workersUsed = Math.max(0, ...[...rendered.output.matchAll(/\((\d+) workers?\)/g)].map((m) => Number(m[1])));

  const v = await verifyVideo({ projectDir, project, build, video, contactSheetFrames, step });
  const report = {
    project: project.id,
    generatedAt: new Date().toISOString(),
    buildHash: build.hash,
    hyperframes: resolveCli()?.version ?? null,
    environment: { platform: `${process.platform}/${process.arch}`, cpus: os.cpus().length, cpuModel: os.cpus()[0]?.model ?? null, memoryGB: Math.round(os.totalmem() / 1024 ** 3), node: process.versions.node },
    settings: { ...settings, workersUsed: workersUsed || null },
    expected: v.expected,
    probe: v.probe,
    spec: v.spec,
    continuity: v.continuity,
    externalResources: v.audit,
    hyperframesCheck: { ok: checked.ok, cached: checked.cached, ...checked.summary },
    renderLog: renderSummary,
    timings: { ...timings, total: seconds(performance.now() - t0) },
    performance: {
      renderSeconds: timings.render,
      secondsPerFrame: Math.round((timings.render / v.expected.frames) * 1000) / 1000,
      realtimeFactor: Math.round((timings.render / v.expected.duration) * 100) / 100,
    },
    files: { video: path.relative(projectDir, video), contactSheet: path.relative(projectDir, v.sheet.output), contactSheetTimes: v.sheet.times, build: path.relative(projectDir, build.buildDir) },
  };
  report.ok = v.ok && checked.ok;
  report.cached = false;
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

/**
 * `vf verify`: vuelve a verificar el MP4 final existente sin renderizar.
 * Actualiza spec/continuidad/auditoría/hoja de contacto en render-report.json.
 */
export async function verifyProject(projectDir, { contactSheetFrames = 12, onStep = () => {} } = {}) {
  const { timings, step } = makeStepper(onStep);
  const validation = validateProject(projectDir);
  if (!validation.ok) throw Object.assign(new Error("El proyecto no es válido"), { validation });
  const project = validation.project;
  const video = path.join(outputDir(projectDir), `${project.id}.mp4`);
  if (!fs.existsSync(video)) throw new Error(`No existe ${path.relative(projectDir, video)}: ejecuta antes vf render`);
  const build = await step("build", () => buildProject(projectDir));
  const reportFile = path.join(outputDir(projectDir), "render-report.json");
  const previous = readJson(reportFile) ?? {};
  const v = await verifyVideo({ projectDir, project, build, video, contactSheetFrames, step });
  const stale = previous.buildHash && previous.buildHash !== build.hash;
  const report = {
    ...previous,
    project: project.id,
    verifiedAt: new Date().toISOString(),
    expected: v.expected,
    probe: v.probe,
    spec: v.spec,
    continuity: v.continuity,
    externalResources: v.audit,
    staleBuild: Boolean(stale),
    ok: v.ok && !stale && previous.hyperframesCheck?.ok !== false,
    verifyTimings: timings,
  };
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}
