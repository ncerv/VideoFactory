// Integración: render completo de la escena de prueba con `vf render` (HyperFrames + Chromium + FFmpeg).
// Se ejecuta con `npm run test:render`. Tarda alrededor de un minuto en 4 CPU sin GPU.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { detectEnvironment } from "../../.claude/skills/video-production/scripts/detect-environment.mjs";
import { resolveCli } from "../../src/adapters/hyperframes.js";
import { paths } from "../../src/orchestrator/paths.js";
import { previewProject } from "../../src/rendering/preview.js";
import { renderProject } from "../../src/rendering/render-project.js";

const env = await detectEnvironment({ projectRoot: paths.root });
const missing = ["ffmpeg", "ffprobe", "chromium"].filter((n) => !env.tools.find((t) => t.name === n)?.found);
if (!resolveCli()) missing.push("hyperframes");
const skip = missing.length ? `faltan herramientas: ${missing.join(", ")}` : false;

test("vf render produce el vídeo vertical de 10 s verificado y su hoja de contacto", { skip, timeout: 600000 }, async () => {
  const project = path.join(paths.projects, "night-forest-test");
  // force: la prueba de integración es la puerta de calidad final y siempre renderiza de verdad
  const report = await renderProject(project, { quality: "looks", force: true });
  assert.equal(report.cached, false);
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
  // la cabecera y la decodificación completa coinciden en 300 fotogramas
  assert.deepEqual(report.spec.filter((c) => ["frames", "decoded"].includes(c.name)).map((c) => c.ok), [true, true]);

  // sin cambios: no se vuelve a renderizar
  const again = await renderProject(project, { quality: "looks" });
  assert.equal(again.cached, true);
  assert.equal(again.buildHash, report.buildHash);
});

test("vf preview captura fotogramas a 540×960 sin renderizar el vídeo", { skip, timeout: 300000 }, async () => {
  const project = path.join(paths.projects, "night-forest-test");
  const summary = await previewProject(project, { at: [0, 6.3] });
  assert.equal(summary.size, "540x960");
  assert.deepEqual(summary.times, [0, 6.3]);
  assert.equal(summary.frames.length, 2);
  for (const f of summary.frames) {
    const png = fs.readFileSync(path.join(project, f));
    assert.equal(png.readUInt32BE(16), 540); // ancho en la cabecera IHDR del PNG
    assert.equal(png.readUInt32BE(20), 960);
  }
  assert.ok(summary.contactSheets.length >= 1);
});
