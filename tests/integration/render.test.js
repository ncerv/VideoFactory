// Prueba de integración: renderiza el proyecto de ejemplo con HyperFrames.
// Se ejecuta aparte con `npm run test:render`: tarda unos segundos y usa Chromium y FFmpeg.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { probe } from "../../src/adapters/ffmpeg.js";
import { lint, render, resolveCli, vendorGsap } from "../../src/adapters/hyperframes.js";
import { paths } from "../../src/orchestrator/paths.js";

import { detectEnvironment } from "../../.claude/skills/video-production/scripts/detect-environment.mjs";

const env = await detectEnvironment({ projectRoot: paths.root });
const missing = ["ffmpeg", "ffprobe", "chromium"].filter((n) => !env.tools.find((t) => t.name === n)?.found);
if (!resolveCli()) missing.push("hyperframes");
const skip = missing.length ? `faltan herramientas: ${missing.join(", ")}` : false;

test("HyperFrames renderiza el proyecto de ejemplo a MP4", { skip, timeout: 300000 }, async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vf-render-"));
  try {
    const compDir = path.join(tmp, "compositions");
    fs.cpSync(path.join(paths.projects, "example-minimal", "compositions"), compDir, { recursive: true });
    vendorGsap(compDir);

    const l = await lint(compDir);
    assert.equal(l.ok, true, l.output);

    const out = path.join(tmp, "out.mp4");
    const r = await render({ compositionDir: compDir, outputFile: out });
    assert.equal(r.code, 0, r.output);

    const info = await probe(out);
    const video = info.streams.find((s) => s.codec_type === "video");
    assert.equal(video.width, 1280);
    assert.equal(video.height, 720);
    assert.ok(Math.abs(Number(info.format.duration) - 3) < 0.2, `duración ${info.format.duration}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
