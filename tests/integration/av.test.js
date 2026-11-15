// Integración: vf av render del proyecto de referencia (night-forest-test + audio-engine-test).
// Se ejecuta con `npm run test:render`. Reutiliza los renders fuente en caché; si faltan, los genera.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { detectEnvironment } from "../../.claude/skills/video-production/scripts/detect-environment.mjs";
import { resolveCli } from "../../src/adapters/hyperframes.js";
import { renderAvProject } from "../../src/av/render.js";
import { paths } from "../../src/orchestrator/paths.js";

const env = await detectEnvironment({ projectRoot: paths.root });
const missing = ["ffmpeg", "ffprobe", "chromium"].filter((n) => !env.tools.find((t) => t.name === n)?.found);
if (!resolveCli()) missing.push("hyperframes");
const skip = missing.length ? `faltan herramientas: ${missing.join(", ")}` : false;
const sha = (f) => createHash("sha256").update(fs.readFileSync(f)).digest("hex");

test("vf av render une vídeo y mezcla aprobada: 1080×1920, 30 fps, 300 fotogramas, AAC 48 kHz estéreo, sin desfase", { skip, timeout: 900000 }, async () => {
  const report = await renderAvProject(path.join(paths.projects, "av-integration-test"), { force: true });
  assert.equal(report.ok, true, JSON.stringify(report.checks.filter((c) => !c.ok), null, 2));
  const { video: v, audio: a } = report;
  assert.deepEqual([v.width, v.height, v.fps, v.frames, v.codec], [1080, 1920, 30, 300, "h264"]);
  assert.deepEqual([a.codec, a.sampleRate, a.channels, a.startTime, v.startTime, a.lagSamples, a.declaredSamples], ["aac", 48000, 2, 0, 0, 0, 480000]);
  assert.ok(Math.abs(report.output.duration - 10) < 1 / 30);
  assert.ok(Math.abs(a.levelDiffDb) < 0.1);
  assert.deepEqual([a.lagStartSamples, a.lagEndSamples, a.paddingSamples], [0, 0, 256], "sin deriva; relleno AAC de 10 s");
  assert.ok(Math.abs(a.stems.pulse.diffDb) <= 0.5, `latido presente en el AAC (${a.stems.pulse.diffDb} dB)`);
  assert.equal(report.sources.video.forced, false, "--force no regenera las fuentes");
  assert.equal(report.sources.audio.forced, false);
  for (const s of Object.values(report.sources)) assert.equal(sha(path.join(paths.root, s.file)), s.sha256, `${s.file} intacto`);
});
