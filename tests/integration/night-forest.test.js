// Integración: render completo de la escena de prueba con `vf render` (HyperFrames + Chromium + FFmpeg).
// Se ejecuta con `npm run test:render`. Tarda alrededor de un minuto en 4 CPU sin GPU.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { detectEnvironment } from "../../.claude/skills/video-production/scripts/detect-environment.mjs";
import { resolveCli } from "../../src/adapters/hyperframes.js";
import { paths } from "../../src/orchestrator/paths.js";
import { renderProject } from "../../src/rendering/render-project.js";

const env = await detectEnvironment({ projectRoot: paths.root });
const missing = ["ffmpeg", "ffprobe", "chromium"].filter((n) => !env.tools.find((t) => t.name === n)?.found);
if (!resolveCli()) missing.push("hyperframes");
const skip = missing.length ? `faltan herramientas: ${missing.join(", ")}` : false;

test("vf render produce el vídeo vertical de 10 s verificado y su hoja de contacto", { skip, timeout: 600000 }, async () => {
  const project = path.join(paths.projects, "night-forest-test");
  const report = await renderProject(project, { quality: "looks" });
  assert.equal(report.ok, true, JSON.stringify({ spec: report.spec, continuity: report.continuity, audit: report.externalResources }, null, 2));
  assert.deepEqual(
    { w: report.probe.width, h: report.probe.height, fps: report.probe.fps, frames: report.probe.frames, codec: report.probe.codec },
    { w: 1080, h: 1920, fps: 30, frames: 300, codec: "h264" },
  );
  assert.ok(Math.abs(report.probe.duration - 10) < 1 / 30);
  assert.equal(report.continuity.spikes.length, 0);
  assert.equal(report.externalResources.findings.length, 0);
  assert.ok(fs.statSync(path.join(project, report.files.contactSheet)).size > 10000);
  assert.ok(fs.existsSync(path.join(project, "output", "render-report.json")));
});
