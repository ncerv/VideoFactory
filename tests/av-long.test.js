// Integración audiovisual con duraciones mayores (35 s y 45 s) y política de caché/forzado de
// vf av render, sin renders reales: las fuentes son sintéticas (vídeo testsrc2 H.264 y WAV con
// stems) y llegan mediante proveedores inyectados que imitan a vf render / vf audio render.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { resolveBinary } from "../src/adapters/ffmpeg.js";
import { encodeWav } from "../src/audio/wav.js";
import { renderAvProject } from "../src/av/render.js";
import { expectedAacPadding } from "../src/av/verify.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vf-av-long-"));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const sha = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const ffmpeg = resolveBinary("ffmpeg");
const skip = ffmpeg && resolveBinary("ffprobe") ? false : "faltan ffmpeg/ffprobe";
const SR = 48000;
const FPS = 30;

/** Stems deterministas: golpes graves tipo latido (≤ 220 Hz) y un tono medio, silencio en los bordes. */
function stems(seconds, { beatGain = 0.3 } = {}) {
  const n = Math.round(seconds * SR);
  const beat = [new Float32Array(n), new Float32Array(n)];
  const tone = [new Float32Array(n), new Float32Array(n)];
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    if (t < 0.2 || t > seconds - 0.2) continue;
    const period = 60 / (52 + (8 * t) / seconds); // tempo que acelera, como el latido
    const tau = t % period; // fase local de cada golpe (membrana con caída de tono)
    const h = Math.exp(-tau * 14) * Math.sin(2 * Math.PI * (70 * tau + (40 / 30) * (1 - Math.exp(-tau * 30))));
    beat[0][i] = beatGain * h;
    beat[1][i] = beatGain * 0.9 * h;
    tone[0][i] = 0.04 * Math.sin(2 * Math.PI * 523.25 * t) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 0.3 * t));
    tone[1][i] = 0.04 * Math.sin(2 * Math.PI * 659.25 * t) * (0.6 + 0.4 * Math.cos(2 * Math.PI * 0.2 * t));
  }
  return { beat, tone };
}
const sumStems = (s) => s.beat.map((c, k) => Float32Array.from(c, (v, i) => v + s.tone[k][i]));
const writeWav = (file, ch, seed) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, encodeWav(ch, { sampleRate: SR, bitDepth: 16, ditherSeed: seed }).buffer);
};

/**
 * Crea projects/{vis,aud,av}-<tag> en tmp con fuentes sintéticas y devuelve proveedores falsos
 * que registran cómo se les llama (y si se les pidió forzar).
 */
function fixture(tag, { duration, width, height }) {
  const root = path.join(tmp, tag, "projects");
  const vis = path.join(root, `vis-${tag}`);
  const aud = path.join(root, `aud-${tag}`);
  const av = path.join(root, `av-${tag}`);
  for (const [d, f] of [[vis, "project.json"], [aud, "audio.json"]]) {
    fs.mkdirSync(path.join(d, "output"), { recursive: true });
    fs.writeFileSync(path.join(d, f), "{}");
  }
  fs.mkdirSync(av, { recursive: true });
  fs.writeFileSync(path.join(av, "av.json"), JSON.stringify({ schemaVersion: 1, id: `av-${tag}`, title: tag, video: { project: `../vis-${tag}` }, audio: { project: `../aud-${tag}` } }, null, 2));
  const video = path.join(vis, "output", `vis-${tag}.mp4`);
  const r = spawnSync(ffmpeg, ["-v", "error", "-y", "-f", "lavfi", "-i", `testsrc2=size=${width}x${height}:rate=${FPS}:duration=${duration}`, "-c:v", "libx264", "-preset", "ultrafast", "-crf", "35", "-pix_fmt", "yuv420p", "-fflags", "+bitexact", video]);
  assert.equal(r.status, 0, r.stderr?.toString());
  const writeAudio = (opts) => {
    const s = stems(duration, opts);
    writeWav(path.join(aud, "output", "stems", "beat.wav"), s.beat, 2);
    writeWav(path.join(aud, "output", "stems", "tone.wav"), s.tone, 3);
    writeWav(path.join(aud, "output", "mix.wav"), sumStems(s), 1);
  };
  writeAudio();
  const calls = [];
  const expected = { width, height, fps: FPS, duration, frames: duration * FPS };
  const providers = {
    video: async (dir, o) => (calls.push({ kind: "video", dir, force: o.force }), { ok: true, project: `vis-${tag}`, cached: !o.force, buildHash: "sintetico", expected, files: { video: `output/vis-${tag}.mp4` } }),
    audio: async (dir, o) => (calls.push({ kind: "audio", dir, force: o.force }), { ok: true, project: `aud-${tag}`, cached: !o.force, inputsHash: "sintetico", files: { mix: "mix.wav", stems: { beat: "stems/beat.wav", tone: "stems/tone.wav" } } }),
  };
  return { av, vis, aud, video, mix: path.join(aud, "output", "mix.wav"), calls, providers, expected, writeAudio };
}

function assertLongReport(r, { duration, width, height }) {
  assert.equal(r.ok, true, JSON.stringify(r.checks.filter((c) => !c.ok), null, 2));
  const { video: v, audio: a } = r;
  assert.deepEqual([v.width, v.height, v.fps, v.frames, v.codec, v.startTime], [width, height, FPS, duration * FPS, "h264", 0]);
  assert.ok(Math.abs(r.output.duration - duration) < 1 / FPS, `duración ${r.output.duration}`);
  assert.ok(Math.abs(v.streamDuration - duration) < 1 / FPS);
  assert.ok(Math.abs(a.duration - v.streamDuration) < 1024 / SR, "duración de los streams coherente");
  assert.deepEqual([a.codec, a.sampleRate, a.channels, a.startTime], ["aac", SR, 2, 0]);
  assert.deepEqual([a.lagSamples, a.lagStartSamples, a.lagEndSamples], [0, 0, 0], "sin desfase ni deriva");
  assert.equal(a.declaredSamples, duration * SR);
  assert.equal(a.paddingSamples, expectedAacPadding(duration * SR));
  assert.ok(Math.abs(a.levelDiffDb) < 0.1, "sin cambio de nivel");
  assert.ok(Math.abs(a.stems.beat.diffDb) <= 0.5, `latido presente en el AAC (${a.stems.beat.diffDb} dB)`);
  for (const name of ["reproduccion", "fuentes-intactas", "video:copiado", "audio:bandas", "audio:stems"]) assert.ok(r.checks.find((c) => c.name === name)?.ok, name);
}

test("relleno AAC esperado: 256 muestras para 10 s; distinto según la duración y siempre < 1 trama", () => {
  assert.equal(expectedAacPadding(480000), 256);
  assert.equal(expectedAacPadding(35 * SR), 384);
  assert.equal(expectedAacPadding(45 * SR), 640);
  for (const s of [1, 1023, 1024, 96000, 1234567]) assert.ok(expectedAacPadding(s) >= 0 && expectedAacPadding(s) < 1024);
});

test("35 s (540×960): sincronía, duración, fotogramas y fuentes; caché y forzado por etapa", { skip, timeout: 300000 }, async () => {
  const spec = { duration: 35, width: 540, height: 960 };
  const fx = fixture("t35", spec);
  const sources = () => [sha(fx.video), sha(fx.mix)];
  const before = sources();

  const r1 = await renderAvProject(fx.av, { providers: fx.providers });
  assert.equal(r1.cached, false);
  assertLongReport(r1, spec);
  assert.deepEqual(sources(), before, "fuentes intactas");
  assert.deepEqual(fx.calls.map((c) => c.force), [false, false], "sin forzar, las fuentes se piden con su caché");

  // Sin cambios: no se multiplexa de nuevo. Documentación nueva: tampoco.
  assert.equal((await renderAvProject(fx.av, { providers: fx.providers })).cached, true);
  fs.writeFileSync(path.join(fx.av, "README.md"), "# notas\n");
  fs.writeFileSync(path.join(fx.aud, "README.md"), "# notas\n");
  assert.equal((await renderAvProject(fx.av, { providers: fx.providers })).cached, true, "un README no invalida la caché");

  // --force: repite solo el multiplexado; las fuentes no se fuerzan.
  fx.calls.length = 0;
  const rf = await renderAvProject(fx.av, { providers: fx.providers, force: true });
  assert.equal(rf.cached, false);
  assert.deepEqual(fx.calls.map((c) => [c.kind, c.force]), [["video", false], ["audio", false]]);
  assert.equal(rf.output.sha256, r1.output.sha256, "multiplexado reproducible");

  // --force-audio / --force-video: regeneran solo esa fuente y multiplexan aunque el resultado no cambie.
  fx.calls.length = 0;
  assert.equal((await renderAvProject(fx.av, { providers: fx.providers, forceAudio: true })).cached, false);
  assert.deepEqual(fx.calls.map((c) => [c.kind, c.force]), [["video", false], ["audio", true]]);
  fx.calls.length = 0;
  assert.equal((await renderAvProject(fx.av, { providers: fx.providers, forceVideo: true })).cached, false);
  assert.deepEqual(fx.calls.map((c) => [c.kind, c.force]), [["video", true], ["audio", false]]);
  fx.calls.length = 0;
  await renderAvProject(fx.av, { providers: fx.providers, forceAll: true });
  assert.deepEqual(fx.calls.map((c) => [c.kind, c.force]), [["video", true], ["audio", true]]);

  // Entradas funcionales cambiadas: el resultado antiguo no se reutiliza.
  fx.writeAudio({ beatGain: 0.35 }); // la fuente de audio cambió (p. ej. otro nivel de latido)
  const rA = await renderAvProject(fx.av, { providers: fx.providers });
  assert.equal(rA.cached, false, "una mezcla distinta invalida la integración");
  assert.notEqual(rA.output.sha256, r1.output.sha256);
  assertLongReport(rA, spec);
  const manifest = JSON.parse(fs.readFileSync(path.join(fx.av, "av.json"), "utf8"));
  fs.writeFileSync(path.join(fx.av, "av.json"), JSON.stringify({ ...manifest, output: { audio: { bitrate: "256k" } } }));
  const rB = await renderAvProject(fx.av, { providers: fx.providers });
  assert.equal(rB.cached, false, "un cambio en av.json invalida la integración");
  assert.ok(rB.audio.bitRate > 230000);
  assert.equal((await renderAvProject(fx.av, { providers: fx.providers })).cached, true);
});

test("45 s (1080×1920): 1350 fotogramas, AAC 48 kHz estéreo, sin deriva, decodificación completa", { skip, timeout: 300000 }, async () => {
  const spec = { duration: 45, width: 1080, height: 1920 };
  const fx = fixture("t45", spec);
  const before = [sha(fx.video), sha(fx.mix)];
  const r = await renderAvProject(fx.av, { providers: fx.providers });
  assertLongReport(r, spec);
  assert.deepEqual([sha(fx.video), sha(fx.mix)], before);
  assert.equal((await renderAvProject(fx.av, { providers: fx.providers })).cached, true);
});

test("una mezcla que no cumple el formato (mono, 44,1 kHz o duración distinta) se rechaza sin convertir", { skip, timeout: 120000 }, async () => {
  const fx = fixture("fmt", { duration: 2, width: 108, height: 192 });
  const mono = path.join(fx.aud, "output", "mix.wav");
  for (const [desc, ch, sr, re] of [
    ["mono", [stems(2).beat[0]], SR, /1 canales/],
    ["44,1 kHz", stems(2).beat, 44100, /44100 Hz/],
    ["más corta", stems(1.5).beat, SR, /1\.500 s frente a 2 s/],
  ]) {
    fs.writeFileSync(mono, encodeWav(ch, { sampleRate: sr, bitDepth: 16, ditherSeed: 1 }).buffer);
    await assert.rejects(renderAvProject(fx.av, { providers: fx.providers }), re, desc);
  }
  assert.ok(!fs.existsSync(path.join(fx.av, "output", `av-fmt.mp4`)), "no se genera salida");
});
