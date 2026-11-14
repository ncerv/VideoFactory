// `vf render`: construye, verifica y renderiza un proyecto de escena, y deja un informe reproducible.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { check, render, resolveCli } from "../adapters/hyperframes.js";
import { validateProject } from "../validation/project.js";
import { buildProject } from "./build.js";
import { contactSheet, evenTimes } from "./contact-sheet.js";
import { auditExternalResources, checkContinuity, checkSpec, probeVideo } from "./verify.js";

const seconds = (ms) => Math.round(ms) / 1000;

/**
 * @param projectDir carpeta del proyecto
 * @param o { quality, workers, contactSheetFrames, onStep(name) }
 * @returns informe (también se escribe en output/render-report.json)
 */
export async function renderProject(projectDir, { quality = "looks", workers = null, contactSheetFrames = 12, onStep = () => {} } = {}) {
  const t0 = performance.now();
  const timings = {};
  const step = async (name, fn) => {
    onStep(name);
    const s = performance.now();
    const r = await fn();
    timings[name] = seconds(performance.now() - s);
    return r;
  };

  const validation = await step("validate", () => validateProject(projectDir));
  if (!validation.ok) throw Object.assign(new Error("El proyecto no es válido"), { validation });
  const project = validation.project;
  const { width, height, fps } = project.output;

  const build = await step("build", () => buildProject(projectDir));
  const duration = build.scene.duration;
  const audit = auditExternalResources(build.buildDir);

  const checkResult = await step("check", () => check(build.buildDir));
  if (!checkResult.ok) throw Object.assign(new Error("hyperframes check encontró errores"), { check: checkResult });

  const outDir = path.join(path.dirname(build.buildDir), "output");
  fs.mkdirSync(outDir, { recursive: true });
  const video = path.join(outDir, `${project.id}.mp4`);
  const rendered = await step("render", () => render({ compositionDir: build.buildDir, outputFile: video, quality, workers }));
  if (rendered.code !== 0) throw Object.assign(new Error("hyperframes render falló"), { output: rendered.output });
  const lines = rendered.output.split(/\r?\n/).map((l) => l.trim());
  const renderSummary = lines.filter((l) => l && !l.startsWith("[") && !l.includes("█") && /rendered in|capture ·|cores detected/i.test(l));
  const workersUsed = Math.max(0, ...[...rendered.output.matchAll(/\((\d+) workers?\)/g)].map((m) => Number(m[1])));

  const probe = await step("probe", () => probeVideo(video));
  const expected = { width, height, fps, duration, frames: Math.round(duration * fps) };
  const spec = checkSpec(probe, expected);
  const continuity = await step("continuity", () => checkContinuity(video));

  const sheet = await step("contactSheet", () =>
    contactSheet({ input: video, output: path.join(outDir, "contact-sheet.jpg"), times: evenTimes(duration, fps, contactSheetFrames), fps, columns: 4, thumbWidth: 360, thumbHeight: 640 }),
  );

  const checkSummary = Object.fromEntries(
    Object.entries(checkResult.result)
      .filter(([, v]) => v && typeof v === "object" && Array.isArray(v.findings))
      .map(([k, v]) => [k, { errors: v.errorCount, warnings: v.warningCount, codes: v.findings.map((f) => f.code) }]),
  );

  const report = {
    project: project.id,
    generatedAt: new Date().toISOString(),
    hyperframes: resolveCli()?.version ?? null,
    environment: { platform: `${process.platform}/${process.arch}`, cpus: os.cpus().length, cpuModel: os.cpus()[0]?.model ?? null, memoryGB: Math.round(os.totalmem() / 1024 ** 3), node: process.versions.node },
    settings: { quality, workers: workers ?? "auto", workersUsed: workersUsed || null },
    expected,
    probe,
    spec,
    continuity,
    externalResources: audit,
    hyperframesCheck: { ok: checkResult.ok, ...checkSummary },
    renderLog: renderSummary,
    timings: { ...timings, total: seconds(performance.now() - t0) },
    performance: {
      renderSeconds: timings.render,
      secondsPerFrame: Math.round((timings.render / expected.frames) * 1000) / 1000,
      realtimeFactor: Math.round((timings.render / duration) * 100) / 100,
    },
    files: { video: path.relative(projectDir, video), contactSheet: path.relative(projectDir, sheet.output), contactSheetTimes: sheet.times, build: path.relative(projectDir, build.buildDir) },
  };
  report.ok = spec.every((c) => c.ok) && continuity.ok && audit.ok && checkResult.ok;
  fs.writeFileSync(path.join(outDir, "render-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}
