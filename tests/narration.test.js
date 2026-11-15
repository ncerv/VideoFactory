// Narración externa y mezcla multipista. Todo el audio de estas pruebas es SINTÉTICO (tonos y ráfagas
// generados con FFmpeg o en JS): no es voz real ni la imita. Comprueba aprobación del guion, recepción
// de WAV/MP3 (formato, metadatos, conversión soxr a 48 kHz estéreo, duración, clipping, integridad y
// hashes), y la mezcla: ganancias, ducking selectivo, voz intacta, normalización final y caché.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { resolveBinary } from "../src/adapters/ffmpeg.js";
import { decodeWav, encodeWav } from "../src/audio/wav.js";
import { loadAvProject } from "../src/av/render.js";
import { detectVoiceActivity, renderMixProject } from "../src/mix/render.js";
import { paths } from "../src/orchestrator/paths.js";
import { validateAgainst } from "../src/validation/schemas.js";
import { approveScript, ingestNarration, loadNarration } from "../src/voice/narration.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vf-narr-"));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const sha = (f) => createHash("sha256").update(fs.readFileSync(f)).digest("hex");
const ffmpeg = resolveBinary("ffmpeg");
const skip = ffmpeg && resolveBinary("ffprobe") ? false : "faltan ffmpeg/ffprobe";
const ff = (...args) => {
  const r = spawnSync(ffmpeg, ["-v", "error", "-y", ...args]);
  assert.equal(r.status, 0, r.stderr?.toString());
};
const PROFILE = fs.readFileSync(path.join(paths.profiles, "voices", "mystery-documentary.md"), "utf8");

/** Proyecto de narración en tmp/<grupo>/projects/<id> con un guion y una "voz" sintética. */
function project(id, { source = "voice/narration.wav", manifest = {} } = {}) {
  const dir = path.join(tmp, id, "projects", id);
  fs.mkdirSync(path.join(dir, "voice"), { recursive: true });
  fs.mkdirSync(path.join(dir, "script"), { recursive: true });
  fs.writeFileSync(path.join(dir, "script", "script.md"), "Guion de prueba (texto sintético, no editorial).\n");
  fs.writeFileSync(path.join(dir, "narration.json"), JSON.stringify({ schemaVersion: 1, id, script: { file: "script/script.md", version: "v1", status: "draft" }, voiceProfile: { id: "mystery-documentary" }, source: { file: source, generator: "señal sintética de prueba" }, ...manifest }, null, 2));
  return dir;
}
/** Ráfagas de tono (sintético) con silencios: 1,2 s de tono cada 2 s. */
const bursts = (file, { sr, ch = 1, d = 6, codec = ["-c:a", "pcm_s16le"] }) =>
  ff("-f", "lavfi", "-i", `sine=f=300:r=${sr}:d=${d},volume='if(lt(mod(t\\,2)\\,1.2)\\,0.5\\,0)':eval=frame`, "-ac", String(ch), ...codec, file);

test("perfil vocal: archivo independiente con el texto exacto, sin etiquetas ni comentarios", () => {
  assert.match(PROFILE, /^Speak in natural, conversational Latin American Spanish, preferably with a Mexican accent\.\n/);
  assert.match(PROFILE, /The overall result should feel immersive, intimate, professional and genuinely human\.\n$/);
  assert.equal(PROFILE.split("\n\n").length, 9, "nueve párrafos");
  assert.doesNotMatch(PROFILE, /[#<>[\]]/, "solo el texto para copiar");
});

test("narration.json: esquema, aprobación explícita y tiempos solo con alineación manual", () => {
  const dir = project("narr-schema");
  const n = loadNarration(dir);
  assert.equal(n.manifest.script.status, "draft");
  assert.ok(validateAgainst("narration", { ...n.manifest, source: { file: "voz.wav" } }).length, "la voz va en voice/");
  assert.ok(validateAgainst("narration", { ...n.manifest, source: { file: "voice/a.ogg" } }).length, "solo WAV o MP3");
  const timed = project("narr-timed", { manifest: { segments: [{ id: "s1", start: 0, end: 2 }] } });
  assert.throws(() => loadNarration(timed), /alignment no es "manual"/);
  const r = approveScript(dir, { version: "v2" });
  assert.equal(r.script.status, "approved");
  assert.equal(r.script.version, "v2");
  assert.equal(r.script.sha256, sha(path.join(dir, "script", "script.md")));
  assert.equal(r.voiceProfile.sha256, sha(path.join(paths.profiles, "voices", "mystery-documentary.md")));
});

test("recepción: sin aprobar, guion cambiado, perfil cambiado o voz ausente se rechazan", { skip }, async () => {
  const dir = project("narr-gate");
  await assert.rejects(ingestNarration(dir), /no está aprobado/);
  approveScript(dir);
  await assert.rejects(ingestNarration(dir), /Falta la narración/);
  bursts(path.join(dir, "voice", "narration.wav"), { sr: 48000, ch: 2 });
  fs.appendFileSync(path.join(dir, "script", "script.md"), "Una frase nueva.\n");
  await assert.rejects(ingestNarration(dir), /cambió después de aprobarse/);
  approveScript(dir);
  const m = JSON.parse(fs.readFileSync(path.join(dir, "narration.json"), "utf8"));
  fs.writeFileSync(path.join(dir, "narration.json"), JSON.stringify({ ...m, voiceProfile: { id: "mystery-documentary", sha256: "0".repeat(64) } }));
  await assert.rejects(ingestNarration(dir), /perfil vocal .* cambió/);
});

test("WAV PCM 48 kHz estéreo: se usa el original sin copiar; --pin fija el hash y detecta cambios; caché", { skip }, async () => {
  const dir = project("narr-wav48");
  const voice = path.join(dir, "voice", "narration.wav");
  bursts(voice, { sr: 48000, ch: 2 });
  approveScript(dir);
  const before = sha(voice);
  const r = await ingestNarration(dir, { pin: true });
  assert.equal(r.ok, true, JSON.stringify(r.checks, null, 2));
  assert.deepEqual([r.source.codec, r.source.sampleRate, r.source.channels, r.source.bitDepth, r.source.lossy], ["pcm_s16le", 48000, 2, 16, false]);
  assert.equal(r.production.converted, false);
  assert.equal(r.production.file, "voice/narration.wav");
  assert.equal(r.source.sha256, before);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "narration.json"), "utf8")).source.sha256, before, "hash fijado en narration.json");
  assert.equal(sha(voice), before, "original intacto");
  assert.equal((await ingestNarration(dir)).cached, true);
  bursts(voice, { sr: 48000, ch: 2, d: 5 }); // otra toma
  await assert.rejects(ingestNarration(dir), /no es la que se fijó/);
});

test("WAV 24 kHz mono → copia 48 kHz estéreo con soxr: duración exacta, canales idénticos, nivel y sincronía", { skip }, async () => {
  const dir = project("narr-wav24");
  const voice = path.join(dir, "voice", "narration.wav");
  bursts(voice, { sr: 24000, ch: 1 });
  approveScript(dir);
  const before = sha(voice);
  const r = await ingestNarration(dir);
  assert.equal(r.ok, true, JSON.stringify(r.checks.filter((c) => !c.ok), null, 2));
  assert.deepEqual([r.source.sampleRate, r.source.channels, r.source.samples], [24000, 1, 144000]);
  assert.deepEqual([r.production.converted, r.production.resampler, r.production.samples, r.production.bitDepth], [true, "soxr", 288000, 24]);
  const prod = decodeWav(fs.readFileSync(path.join(dir, r.production.file)));
  assert.deepEqual([prod.sampleRate, prod.channels.length, prod.fullScaleSamples], [48000, 2, 0]);
  for (const n of ["produccion:duracion", "produccion:nivel", "produccion:sincronia", "produccion:mono-duplicado", "fuente:intacta"]) assert.ok(r.checks.find((c) => c.name === n)?.ok, n);
  assert.equal(sha(voice), before);
  assert.equal(r.pinned, false, "sin --pin no se fija");
});

test("MP3 44,1 kHz estéreo: con pérdida, sin profundidad de bits; conversión sin cambiar duración ni nivel", { skip }, async () => {
  const dir = project("narr-mp3", { source: "voice/narration.mp3" });
  const voice = path.join(dir, "voice", "narration.mp3");
  bursts(voice, { sr: 44100, ch: 2, codec: ["-c:a", "libmp3lame", "-b:a", "128k"] });
  approveScript(dir);
  const before = sha(voice);
  const r = await ingestNarration(dir);
  assert.equal(r.ok, true, JSON.stringify(r.checks.filter((c) => !c.ok), null, 2));
  assert.deepEqual([r.source.codec, r.source.sampleRate, r.source.channels, r.source.lossy], ["mp3", 44100, 2, true]);
  assert.ok(Math.abs(r.source.samples / 44100 - 6) < 0.03, `duración decodificada ${r.source.samples / 44100} s`);
  assert.ok(Math.abs(r.production.duration - r.source.samples / 44100) < 0.001);
  assert.equal(sha(voice), before);
});

test("se rechazan archivos corruptos, de más de dos canales y conversiones que recortarían", { skip }, async () => {
  const bad = project("narr-corrupt");
  fs.writeFileSync(path.join(bad, "voice", "narration.wav"), Buffer.from("RIFF0000WAVEnodata"));
  approveScript(bad);
  await assert.rejects(ingestNarration(bad), /no se puede decodificar|no contiene audio|ffprobe/);

  const multi = project("narr-51");
  ff("-f", "lavfi", "-i", "sine=f=200:r=48000:d=2", "-ac", "6", "-c:a", "pcm_s16le", path.join(multi, "voice", "narration.wav"));
  approveScript(multi);
  await assert.rejects(ingestNarration(multi), /6 canales/);

  // Onda cuadrada a fondo de escala: el remuestreo produce sobreoscilaciones por encima de 0 dBFS.
  const hot = project("narr-hot");
  const n = 24000 * 2;
  const sq = Float32Array.from({ length: n }, (_, i) => (Math.floor(i / 6) % 2 ? 0.999 : -0.999));
  fs.writeFileSync(path.join(hot, "voice", "narration.wav"), encodeWav([sq], { sampleRate: 24000, bitDepth: 16, ditherSeed: null }).buffer);
  approveScript(hot);
  const r = await ingestNarration(hot);
  assert.equal(r.ok, false);
  assert.equal(r.checks.find((c) => c.name === "produccion:clipping").ok, false);
  assert.ok(!fs.existsSync(path.join(hot, "output", "voice", "narration-48k.wav")), "la copia defectuosa no queda disponible");
});

test("detección de actividad de voz: tramos donde hay señal, sin inventar tiempos de frase", () => {
  const sr = 48000;
  const ch = [new Float32Array(sr * 5)];
  for (const [a, b] of [[0.5, 1.5], [1.7, 2.0], [3.0, 4.0]]) for (let i = a * sr; i < b * sr; i++) ch[0][i] = 0.3 * Math.sin(i / 20);
  const w = detectVoiceActivity(ch, sr);
  assert.equal(w.length, 2, JSON.stringify(w)); // el silencio de 0,2 s no corta la locución
  assert.ok(Math.abs(w[0].start - 0.5) < 0.03 && Math.abs(w[0].end - 2.0) < 0.03);
  assert.ok(Math.abs(w[1].start - 3.0) < 0.03 && Math.abs(w[1].end - 4.0) < 0.03);
});

/** Proyecto de mezcla: narración sintética (24 kHz mono), música y efecto sintéticos. */
function mixProject(id, plan) {
  const dir = project(id);
  bursts(path.join(dir, "voice", "narration.wav"), { sr: 24000, ch: 1 });
  approveScript(dir);
  fs.mkdirSync(path.join(dir, "stems"), { recursive: true });
  ff("-f", "lavfi", "-i", "sine=f=110:r=48000:d=8", "-ac", "2", "-c:a", "pcm_s16le", path.join(dir, "stems", "music.wav"));
  ff("-f", "lavfi", "-i", "sine=f=1500:r=48000:d=8,volume=0.5", "-ac", "2", "-c:a", "pcm_s16le", path.join(dir, "stems", "sfx.wav"));
  fs.writeFileSync(path.join(dir, "mix.json"), JSON.stringify({
    schemaVersion: 1,
    duration: 8,
    tracks: [
      { id: "voz", role: "voice", source: { type: "narration" }, start: 1 },
      { id: "musica", role: "music", source: { type: "stem", stem: "stems/music.wav" }, gainDb: -6 },
      { id: "golpe", role: "sfx", source: { type: "stem", stem: "stems/sfx.wav" }, gainDb: -12 },
    ],
    ducking: { amountDb: -10 },
    loudness: { integratedLufs: -16, truePeakDb: -1 },
    ...plan,
  }, null, 2));
  return dir;
}

test("mezcla: voz intacta, música atenuada durante la voz, efecto sin tocar, normalización final y caché", { skip, timeout: 120000 }, async () => {
  const dir = mixProject("mix-basic");
  const r = await renderMixProject(dir);
  assert.equal(r.ok, true, JSON.stringify(r.checks.filter((c) => !c.ok), null, 2));
  assert.equal(r.activity.source, "detected");
  assert.equal(r.activity.windows.length, 3);
  assert.ok(Math.abs(r.activity.windows[0].start - 1) < 0.03, "la voz empieza en su start (1 s)");
  assert.equal(r.tracks.voz.ducked, false);
  assert.equal(r.tracks.musica.ducked, true);
  assert.equal(r.tracks.golpe.ducked, false, "los efectos no se atenúan por defecto");
  assert.ok(Math.abs(r.tracks.voz.presenceDb - r.tracks.voz.expectedDb) <= 0.5, "voz con su ganancia + master");
  assert.ok(Math.abs(r.tracks.golpe.presenceDb - r.tracks.golpe.expectedDb) <= 0.2, "efecto sin ducking");
  assert.ok(r.tracks.musica.presenceDb < r.tracks.musica.expectedDb - 2, "música atenuada en promedio");
  assert.equal(r.master.reachedTarget, true);
  assert.ok(Math.abs(r.master.after.integratedLufs - -16) <= 0.5);
  const w = decodeWav(fs.readFileSync(path.join(dir, "output", r.files.mix)));
  assert.deepEqual([w.sampleRate, w.channels.length, w.frames, w.bitDepth], [48000, 2, 8 * 48000, 16]);
  const again = await renderMixProject(dir);
  assert.equal(again.cached, true);
  const forced = await renderMixProject(dir, { force: true });
  assert.equal(forced.output.sha256, r.output.sha256, "mezcla determinista");
});

test("mezcla: duck=false protege un efecto; duck=true lo atenúa; tiempos manuales; techo antes que LUFS", { skip, timeout: 120000 }, async () => {
  const dir = mixProject("mix-controls", {
    tracks: [
      { id: "voz", role: "voice", source: { type: "narration" }, start: 1 },
      { id: "musica", role: "music", source: { type: "stem", stem: "stems/music.wav" }, gainDb: -6, duck: false },
      { id: "golpe", role: "sfx", source: { type: "stem", stem: "stems/sfx.wav" }, gainDb: -12, duck: true },
    ],
    loudness: { integratedLufs: -5, truePeakDb: -6 },
  });
  const n = JSON.parse(fs.readFileSync(path.join(dir, "narration.json"), "utf8"));
  fs.writeFileSync(path.join(dir, "narration.json"), JSON.stringify({ ...n, alignment: "manual", segments: [{ id: "s1", start: 0, end: 1.2 }, { id: "s2", start: 2, end: 3.2 }] }));
  const r = await renderMixProject(dir);
  assert.equal(r.ok, true, JSON.stringify(r.checks.filter((c) => !c.ok), null, 2));
  assert.equal(r.activity.source, "segments");
  assert.deepEqual(r.activity.windows, [{ start: 1, end: 2.2 }, { start: 3, end: 4.2 }], "tiempos manuales + start de la pista");
  assert.deepEqual([r.tracks.musica.ducked, r.tracks.golpe.ducked], [false, true]);
  assert.equal(r.master.reachedTarget, false, "el techo impide -5 LUFS sin compresión");
  assert.ok(r.master.after.truePeakDb <= -6 + 0.2);
  assert.equal(r.checks.find((c) => c.name === "mezcla:sonoridad").level, "warning");
});

test("mezcla: la voz no se recorta, la voz segmentada aún no se ejecuta y mode none respeta el techo", { skip, timeout: 120000 }, async () => {
  const short = mixProject("mix-short", { duration: 4 });
  await assert.rejects(renderMixProject(short), /la voz nunca se recorta/);
  const seg = mixProject("mix-seg", { tracks: [{ id: "voz", role: "voice", source: { type: "tts", segments: [{ id: "a", start: 0, file: "voice/a.wav" }] } }] });
  await assert.rejects(renderMixProject(seg), /aún no está implementada/);
  const none = mixProject("mix-none", { loudness: { mode: "none", integratedLufs: -14, truePeakDb: -30 } });
  await assert.rejects(renderMixProject(none), /supera el techo/);
});

test("av.json multitrack: la integración audiovisual toma la mezcla de un proyecto con mix.json", () => {
  const root = path.join(tmp, "av-multi", "projects");
  for (const [d, f] of [["vis-m", "project.json"], ["mezcla-m", "mix.json"], ["av-m", null]]) {
    fs.mkdirSync(path.join(root, d), { recursive: true });
    if (f) fs.writeFileSync(path.join(root, d, f), "{}");
  }
  fs.writeFileSync(path.join(root, "av-m", "av.json"), JSON.stringify({ schemaVersion: 1, id: "av-m", title: "t", video: { project: "../vis-m" }, audio: { project: "../mezcla-m", use: "multitrack" } }));
  const av = loadAvProject(path.join(root, "av-m"));
  assert.equal(av.audioDir, path.join(root, "mezcla-m"));
  assert.equal(av.settings.audioUse, "multitrack");
  fs.writeFileSync(path.join(root, "av-m", "av.json"), JSON.stringify({ schemaVersion: 1, id: "av-m", title: "t", video: { project: "../vis-m" }, audio: { project: "../mezcla-m" } }));
  assert.throws(() => loadAvProject(path.join(root, "av-m")), /audio\.json/, "use mix exige un proyecto de audio procedural");
});

test("CLI: comandos de guion, voz y mezcla con uso correcto", () => {
  const VF = path.join(paths.root, "src", "cli", "vf.js");
  const run = (...args) => spawnSync(process.execPath, [VF, ...args], { encoding: "utf8", cwd: paths.root, timeout: 60000 });
  for (const [cmd, sub] of [["script", "approve"], ["voice", "ingest"], ["mix", "render"]]) {
    assert.equal(run(cmd).status, 2, cmd);
    const r = run(cmd, sub, path.join(tmp, "no-existe"));
    assert.equal(r.status, 1);
    assert.match(r.stderr, /No existe (narration|mix)\.json/);
  }
  const help = run("--help").stdout;
  for (const s of ["vf script approve", "vf voice ingest", "vf mix render"]) assert.match(help, new RegExp(s));
});
