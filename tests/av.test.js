// Integración audiovisual (vf av render): contrato av.json, resolución de proyectos fuente,
// medida del desfase y multiplexado real con FFmpeg sobre fuentes sintéticas pequeñas
// (vídeo copiado, AAC 48 kHz estéreo, sincronía, nivel conservado, fuentes intactas, determinismo).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { resolveBinary } from "../src/adapters/ffmpeg.js";
import { encodeWav } from "../src/audio/wav.js";
import { loadAvProject, muxAndVerify } from "../src/av/render.js";
import { measureLag, verifyAvOutput } from "../src/av/verify.js";
import { paths } from "../src/orchestrator/paths.js";
import { validateAgainst } from "../src/validation/schemas.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vf-av-"));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const sha = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const ffmpeg = resolveBinary("ffmpeg");
const skip = ffmpeg && resolveBinary("ffprobe") ? false : "faltan ffmpeg/ffprobe";
const SR = 48000;
const EXPECTED = { width: 108, height: 192, fps: 30, duration: 2, frames: 60 };

/** Señal estéreo determinista: tono grave con golpes, silencio en los extremos; delay en muestras. */
function signal(seconds, delay = 0) {
  const n = Math.round(seconds * SR);
  const ch = [new Float32Array(n), new Float32Array(n)];
  for (let i = 0; i < n; i++) {
    const t = (i - delay) / SR;
    if (t < 0.1 || t > seconds - 0.1) continue;
    const hit = Math.exp(-((t % 0.37) * 18)) * Math.sin(2 * Math.PI * 90 * t);
    ch[0][i] = 0.3 * hit + 0.05 * Math.sin(2 * Math.PI * 440 * t);
    ch[1][i] = 0.25 * hit + 0.05 * Math.sin(2 * Math.PI * 660 * t);
  }
  return ch;
}
const writeWav = (file, ch) => fs.writeFileSync(file, encodeWav(ch, { sampleRate: SR, bitDepth: 16, ditherSeed: 1 }).buffer);

let video;
const sourcesReady = (() => {
  if (skip) return false;
  video = path.join(tmp, "video.mp4");
  const r = spawnSync(ffmpeg, ["-v", "error", "-f", "lavfi", "-i", `testsrc2=size=${EXPECTED.width}x${EXPECTED.height}:rate=30:duration=2`, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-fflags", "+bitexact", "-y", video]);
  return r.status === 0;
})();

test("av.json: el proyecto de referencia cumple el contrato y los errores se detectan", () => {
  const ref = JSON.parse(fs.readFileSync(path.join(paths.projects, "av-integration-test", "av.json"), "utf8"));
  assert.deepEqual(validateAgainst("avProject", ref), []);
  const bad = (patch) => validateAgainst("avProject", { ...ref, ...patch }).length > 0;
  assert.ok(bad({ video: { project: "/abs/night-forest-test" } }), "ruta absoluta");
  assert.ok(bad({ audio: { project: "../../fuera" } }), "fuera de projects/");
  assert.ok(bad({ audio: { project: "../audio-engine-test", use: "stems" } }), "solo mezcla procedural o multipista");
  assert.ok(!bad({ audio: { project: "../demo-mezcla", use: "multitrack" } }), "mezcla multipista");
  assert.ok(bad({ output: { audio: { bitrate: "1000k" } } }), "tasa de bits");
  assert.ok(bad({ output: { audio: { sampleRate: 44100 } } }), "48 kHz");
  const { audio, ...noAudio } = ref;
  assert.ok(validateAgainst("avProject", noAudio).length > 0, "audio obligatorio");
});

test("loadAvProject resuelve proyectos hermanos y rechaza referencias incorrectas", () => {
  const root = path.join(tmp, "projects");
  for (const [d, f] of [["vis-a", "project.json"], ["aud-a", "audio.json"]]) {
    fs.mkdirSync(path.join(root, d), { recursive: true });
    fs.writeFileSync(path.join(root, d, f), "{}");
  }
  const make = (id, manifest) => {
    fs.mkdirSync(path.join(root, id), { recursive: true });
    fs.writeFileSync(path.join(root, id, "av.json"), JSON.stringify({ schemaVersion: 1, id, title: "t", video: { project: "../vis-a" }, audio: { project: "../aud-a" }, ...manifest }));
    return path.join(root, id);
  };
  const ok = loadAvProject(make("av-ok"));
  assert.equal(ok.videoDir, path.join(root, "vis-a"));
  assert.equal(ok.audioDir, path.join(root, "aud-a"));
  assert.deepEqual(ok.settings, { quality: "looks", audioUse: "mix", audio: { codec: "aac", bitrate: "192k", sampleRate: 48000, channels: 2 } });
  assert.throws(() => loadAvProject(make("av-id", { id: "otro-id" })), /no coincide/);
  assert.throws(() => loadAvProject(make("av-swap", { video: { project: "../aud-a" } })), /project\.json/);
  assert.throws(() => loadAvProject(make("av-none", { audio: { project: "../no-existe" } })), /audio\.json/);
});

test("measureLag encuentra el desfase exacto en muestras", () => {
  const ref = signal(1.5);
  assert.equal(measureLag(ref, ref).lag, 0);
  assert.equal(measureLag(ref, signal(1.5, 37)).lag, 37);
  assert.equal(measureLag(ref, signal(1.5, -480)).lag, -480);
});

test("muxAndVerify: vídeo copiado + AAC, sincronía y nivel conservados, fuentes intactas y salida determinista", { skip: skip || (!sourcesReady && "no se pudo generar el vídeo sintético"), timeout: 120000 }, async () => {
  const audio = path.join(tmp, "mix.wav");
  writeWav(audio, signal(2));
  const before = [sha(video), sha(audio)];
  const out1 = path.join(tmp, "out", "a.mp4");
  const res = await muxAndVerify({ video, audio, output: out1, expected: EXPECTED });
  assert.equal(res.ok, true, JSON.stringify(res.verification.checks.filter((c) => !c.ok), null, 2));
  const names = res.verification.checks.map((c) => c.name);
  for (const n of ["video:copiado", "audio:codec", "audio:frecuencia", "audio:canales", "inicio", "duracion:streams", "audio:muestras", "sincronia", "audio:nivel", "reproduccion", "fuentes-intactas"]) assert.ok(names.includes(n), `falta la comprobación ${n}`);
  const a = res.verification.audio;
  assert.deepEqual([a.codec, a.sampleRate, a.channels, a.lagSamples, a.declaredSamples], ["aac", 48000, 2, 0, 96000]);
  assert.ok(Math.abs(a.levelDiffDb) < 0.1, "sin cambio de ganancia");
  assert.deepEqual([sha(video), sha(audio)], before, "las fuentes no cambian");
  assert.ok(!fs.existsSync(`${out1}.partial.mp4`), "sin temporales");
  const out2 = path.join(tmp, "out", "b.mp4");
  const res2 = await muxAndVerify({ video, audio, output: out2, expected: EXPECTED });
  assert.equal(res2.sha256, res.sha256, "dos multiplexados idénticos byte a byte");
});

test("verifyAvOutput detecta desfase y duración incoherente", { skip: skip || (!sourcesReady && "no se pudo generar el vídeo sintético"), timeout: 120000 }, async () => {
  const ref = path.join(tmp, "ref.wav");
  const late = path.join(tmp, "late.wav");
  const short = path.join(tmp, "short.wav");
  writeWav(ref, signal(2));
  writeWav(late, signal(2, 480)); // 10 ms tarde
  writeWav(short, signal(1.5));
  const lateMp4 = path.join(tmp, "late.mp4");
  await muxAndVerify({ video, audio: late, output: lateMp4, expected: EXPECTED });
  const v = await verifyAvOutput({ file: lateMp4, sourceVideo: video, sourceAudio: ref, expected: { ...EXPECTED, sampleRate: SR, channels: 2, audioCodec: "aac" } });
  const sync = v.checks.find((c) => c.name === "sincronia");
  assert.equal(sync.ok, false);
  assert.equal(v.audio.lagSamples, 480);
  const shortRes = await muxAndVerify({ video, audio: short, output: path.join(tmp, "short.mp4"), expected: EXPECTED });
  assert.equal(shortRes.ok, false);
  assert.equal(shortRes.verification.checks.find((c) => c.name === "duracion:streams").ok, false);
});

test("vf av: uso incorrecto y proyecto inexistente", () => {
  const VF = path.join(paths.root, "src", "cli", "vf.js");
  const run = (...args) => spawnSync(process.execPath, [VF, ...args], { encoding: "utf8", cwd: paths.root, timeout: 60000 });
  assert.equal(run("av").status, 2);
  const r = run("av", "render", path.join(tmp, "no-existe"));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /No existe av\.json/);
  assert.match(run("--help").stdout, /vf av render/);
});
