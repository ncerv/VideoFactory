// `vf mix render`: ejecuta el plan de mezcla mix.json (schemas/audio-mix.schema.json).
//
// Pistas: la narración del proyecto (copia de producción de vf voice ingest) y stems WAV (p. ej. los
// de vf audio render de un proyecto hermano, que se regeneran antes con su propia caché).
// Cada pista recibe solo su ganancia fija (no se normaliza pista a pista). El ducking atenúa las
// pistas de música y ambiente mientras suena la voz; los efectos no se tocan salvo que se pida.
// La normalización se decide sobre la mezcla completa: una sola ganancia lineal hacia el objetivo
// de LUFS sin superar el techo de pico verdadero (sin compresor ni limitador).
// Salida: output/mix/mix.wav (PCM 16 bits, 48 kHz, estéreo, dither con semilla) + mix-report.json.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ffmpegVersion } from "../adapters/ffmpeg.js";
import { renderAudioProject } from "../audio/render.js";
import { duckingEnvelope, multiply, scale, sum } from "../audio/dsp.js";
import { loudness, probeWav } from "../audio/verify.js";
import { decodeWav, encodeWav } from "../audio/wav.js";
import { hashFiles, moduleGraph } from "../orchestrator/fingerprint.js";
import { validateAgainst } from "../validation/schemas.js";
import { ingestNarration, loadNarration, sha256File } from "../voice/narration.js";

const SR = 48000;
const seconds = (ms) => Math.round(ms) / 1000;
const r2 = (v) => Math.round(v * 100) / 100;
const db = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);
const dbToGain = (d) => 10 ** (d / 20);
const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
export const DUCKING_DEFAULTS = { amountDb: -8, attack: 0.25, release: 0.6, roles: ["music", "ambience"], detection: { thresholdDb: -40, holdSeconds: 0.35, minSeconds: 0.1 } };

/** Carga y valida mix.json y la coherencia entre pistas. */
export function loadMixPlan(projectDir) {
  const dir = path.resolve(projectDir);
  const file = path.join(dir, "mix.json");
  if (!fs.existsSync(file)) throw new Error(`No existe mix.json en ${dir}`);
  const plan = readJson(file);
  const errors = validateAgainst("audioMix", plan);
  if (errors.length) throw Object.assign(new Error(`mix.json no válido: ${errors.map((e) => `${e.instancePath} ${e.message}`).join("; ")}`), { errors });
  const ids = plan.tracks.map((t) => t.id);
  if (new Set(ids).size !== ids.length) throw new Error("Hay pistas con id repetido");
  const narration = plan.tracks.filter((t) => t.source.type === "narration");
  if (narration.length > 1) throw new Error("Solo puede haber una pista de narración");
  for (const t of plan.tracks) {
    if (t.source.type === "tts") throw new Error(`Pista ${t.id}: la voz en varios archivos (source.type "tts") aún no está implementada; entrega un único archivo completo y usa source.type "narration"`);
    if (t.source.type === "narration" && t.role !== "voice") throw new Error(`Pista ${t.id}: la narración debe tener role "voice"`);
    if (t.duckedBy && !narration.some((x) => x.id === t.duckedBy)) throw new Error(`Pista ${t.id}: duckedBy "${t.duckedBy}" debe ser la pista de narración`);
  }
  return { dir, file, plan, narrationTrack: narration[0] ?? null };
}

/** Si un stem está en la salida de un proyecto de audio hermano, devuelve esa carpeta. */
function audioProjectOf(dir, stemFile) {
  const rel = path.relative(path.dirname(dir), stemFile).split(path.sep);
  if (rel.length >= 3 && rel[1] === "output" && rel[0] !== path.basename(dir)) {
    const proj = path.join(path.dirname(dir), rel[0]);
    if (fs.existsSync(path.join(proj, "audio.json"))) return proj;
  }
  return null;
}

/**
 * Actividad de la voz por energía (ventanas de 20 ms): marca dónde hay voz para el ducking.
 * No da tiempos de frase: los silencios cortos (holdSeconds) se consideran parte de la locución.
 */
export function detectVoiceActivity(channels, sampleRate, { thresholdDb = -40, holdSeconds = 0.35, minSeconds = 0.1 } = {}) {
  const hop = Math.round(sampleRate * 0.02);
  const n = channels[0].length;
  const thr = dbToGain(thresholdDb);
  const active = [];
  for (let s = 0; s < n; s += hop) {
    let e = 0;
    const end = Math.min(n, s + hop);
    for (const c of channels) for (let i = s; i < end; i++) e += c[i] * c[i];
    active.push(Math.sqrt(e / (channels.length * (end - s))) >= thr);
  }
  const windows = [];
  let cur = null;
  active.forEach((a, k) => {
    const t = (k * hop) / sampleRate;
    if (a) {
      if (cur && t - cur.end <= holdSeconds) cur.end = t + hop / sampleRate;
      else {
        if (cur) windows.push(cur);
        cur = { start: t, end: t + hop / sampleRate };
      }
    }
  });
  if (cur) windows.push(cur);
  return windows.filter((w) => w.end - w.start >= minSeconds).map((w) => ({ start: r2(w.start * 1000) / 1000, end: Math.min(n / sampleRate, r2(w.end * 1000) / 1000) }));
}

/** Ganancia (dB) de la proyección de `mix` sobre `ref`: cuánto de `ref` contiene la mezcla. */
function projectionDb(mix, ref, offset = 0) {
  let num = 0;
  let den = 0;
  for (let c = 0; c < ref.length; c++) for (let i = 0; i < ref[c].length && i + offset < mix[c].length; i++) {
    num += mix[c][i + offset] * ref[c][i];
    den += ref[c][i] * ref[c][i];
  }
  return den > 0 && num > 0 ? db(num / den) : -Infinity;
}

export const mixModules = () => moduleGraph([fileURLToPath(import.meta.url)]);

/**
 * @param o { force, onStep }
 * @returns informe (también en output/mix/mix-report.json); files.mix es relativo a output/
 */
export async function renderMixProject(projectDir, { force = false, onStep = () => {} } = {}) {
  const t0 = performance.now();
  const timings = {};
  const step = async (name, fn) => {
    onStep(name);
    const s = performance.now();
    const r = await fn();
    timings[name] = seconds(performance.now() - s);
    return r;
  };
  const { dir, file, plan, narrationTrack } = await step("load", () => loadMixPlan(projectDir));
  const project = path.basename(dir);
  const ducking = { ...DUCKING_DEFAULTS, ...(plan.ducking ?? {}), detection: { ...DUCKING_DEFAULTS.detection, ...(plan.ducking?.detection ?? {}) } };
  const loud = { mode: "linear", ...plan.loudness };

  // Fuentes: narración (recepción en caché) y stems (proyecto de audio en caché si procede).
  const sources = {};
  let narrationInfo = null;
  for (const t of plan.tracks) {
    if (t.source.type === "narration") {
      const rep = await step(`voice:${t.id}`, () => ingestNarration(dir, { onStep: (n) => onStep(`voice:${n}`) }));
      if (!rep.ok) throw new Error(`La narración no superó la recepción: ${rep.checks.filter((c) => !c.ok && c.level !== "warning").map((c) => c.name).join(", ")}`);
      narrationInfo = rep;
      sources[t.id] = path.join(dir, rep.production.file);
    } else {
      const f = path.resolve(dir, t.source.stem);
      const proj = audioProjectOf(dir, f);
      if (proj) await step(`audio:${path.basename(proj)}`, () => renderAudioProject(proj));
      if (!fs.existsSync(f)) throw new Error(`Pista ${t.id}: no existe ${t.source.stem}`);
      sources[t.id] = f;
    }
  }
  const sourceShas = Object.fromEntries(Object.entries(sources).map(([id, f]) => [id, sha256File(f)]));
  const narrationManifest = narrationTrack ? fs.readFileSync(path.join(dir, "narration.json"), "utf8") : null;
  const h = createHash("sha256").update(fs.readFileSync(file)).update(JSON.stringify({ sourceShas, narrationManifest, ffmpeg: await ffmpegVersion() }));
  hashFiles(h, mixModules());
  const hash = h.digest("hex").slice(0, 16);

  const outDir = path.join(dir, "output", "mix");
  const mixFile = path.join(outDir, "mix.wav");
  const reportFile = path.join(outDir, "mix-report.json");
  if (!force && fs.existsSync(reportFile) && fs.existsSync(mixFile)) {
    const prev = readJson(reportFile);
    if (prev.ok && prev.inputsHash === hash && prev.output?.sha256 === sha256File(mixFile)) return { ...prev, cached: true, timings: { ...timings, total: seconds(performance.now() - t0) } };
  }

  const L = Math.round(plan.duration * SR);
  const checks = [];
  const add = (name, ok, detail, level = "error") => checks.push({ name, ok: Boolean(ok), level, detail });

  // Colocación y ganancia fija de cada pista.
  const tracks = [];
  for (const t of plan.tracks) {
    const w = decodeWav(fs.readFileSync(sources[t.id]));
    if (w.sampleRate !== SR || w.channels.length !== 2) throw new Error(`Pista ${t.id}: ${w.sampleRate} Hz y ${w.channels.length} canales (se esperan 48 kHz estéreo)`);
    const off = Math.round((t.start ?? 0) * SR);
    const fits = off + w.frames <= L;
    if (!fits && t.role === "voice") throw new Error(`La narración (${(w.frames / SR).toFixed(3)} s desde ${t.start ?? 0} s) no cabe en ${plan.duration} s: la voz nunca se recorta; ajusta duration`);
    if (!fits) add(`pista:${t.id}:recorte`, true, `termina en ${((off + w.frames) / SR).toFixed(3)} s: se recorta a ${plan.duration} s`, "warning");
    const data = [new Float32Array(L), new Float32Array(L)];
    for (let c = 0; c < 2; c++) data[c].set(w.channels[c].subarray(0, Math.max(0, Math.min(w.frames, L - off))), off);
    scale(data, dbToGain(t.gainDb ?? 0));
    tracks.push({ ...t, data, raw: w.channels, offset: off });
  }

  // Actividad de la voz: tiempos manuales de narration.json, o detección por energía.
  let activity = { source: "none", windows: [] };
  if (narrationTrack) {
    const voice = tracks.find((t) => t.id === narrationTrack.id);
    const n = loadNarration(dir).manifest;
    const timed = (n.segments ?? []).filter((s) => s.start !== undefined);
    const startOff = narrationTrack.start ?? 0;
    if (n.alignment === "manual" && timed.length) activity = { source: "segments", windows: timed.map((s) => ({ start: s.start + startOff, end: s.end + startOff })) };
    else activity = { source: "detected", windows: detectVoiceActivity(voice.raw, SR, ducking.detection).map((w) => ({ start: w.start + startOff, end: w.end + startOff })) };
  }
  const env = activity.windows.length ? duckingEnvelope(L, SR, activity.windows, ducking) : null;
  const ducked = [];
  for (const t of tracks) {
    if (t.role === "voice") continue;
    const want = t.duck === false ? false : t.duck === true || Boolean(t.duckedBy) || ducking.roles.includes(t.role);
    if (want && env) {
      multiply(t.data, env);
      ducked.push(t.id);
    }
  }

  // Suma y normalización de la mezcla completa (una sola ganancia lineal).
  const mix = sum(tracks.map((t) => t.data));
  fs.mkdirSync(outDir, { recursive: true });
  const measure = async (channels) => {
    let peak = 0;
    for (const c of channels) for (const v of c) peak = Math.max(peak, Math.abs(v));
    const k = peak > 0.5 ? 0.5 / peak : 1; // margen para medir sin recortar; LUFS y dBTP escalan con la ganancia
    const tmp = path.join(outDir, "measure.partial.wav");
    fs.writeFileSync(tmp, encodeWav(channels.map((c) => Float32Array.from(c, (v) => v * k)), { sampleRate: SR, bitDepth: 24, ditherSeed: null }).buffer);
    const m = await loudness(tmp);
    fs.rmSync(tmp, { force: true });
    const back = -db(k);
    return { integratedLufs: m.integratedLufs + back, truePeakDb: m.truePeakDb + back, samplePeakDb: db(peak) };
  };
  const pre = await step("measure", () => measure(mix));
  let masterDb = 0;
  let reached = null;
  if (loud.mode === "linear") {
    const toTarget = loud.integratedLufs - pre.integratedLufs;
    const toCeiling = loud.truePeakDb - pre.truePeakDb;
    masterDb = Math.min(toTarget, toCeiling);
    reached = toTarget <= toCeiling;
  } else if (pre.truePeakDb > loud.truePeakDb) {
    throw new Error(`Sin normalización (mode none), la mezcla supera el techo: ${r2(pre.truePeakDb)} dBTP > ${loud.truePeakDb} dBTP. Baja las ganancias de las pistas`);
  }
  scale(mix, dbToGain(masterDb));
  const { buffer, clipped } = encodeWav(mix, { sampleRate: SR, bitDepth: 16, ditherSeed: 20261115 });
  const tmpMix = `${mixFile}.partial.wav`;
  fs.writeFileSync(tmpMix, buffer);
  fs.renameSync(tmpMix, mixFile);

  // Verificación de la mezcla escrita.
  const p = await probeWav(mixFile);
  add("mezcla:formato", p.codec === "pcm_s16le" && p.sampleRate === SR && p.channels === 2, `${p.codec} · ${p.sampleRate} Hz · ${p.channels} canales`);
  add("mezcla:duracion", p.frames === L, `${p.frames} muestras = ${(p.frames / SR).toFixed(4)} s (esperadas ${L})`);
  add("mezcla:clipping", clipped === 0, `${clipped} muestras recortadas al cuantizar`);
  const post = await loudness(mixFile);
  add("mezcla:techo", post.truePeakDb <= loud.truePeakDb + 0.2, `true peak ${post.truePeakDb} dBTP (techo ${loud.truePeakDb} dBTP)`);
  if (loud.mode === "linear") {
    add("mezcla:sonoridad", reached ? Math.abs(post.integratedLufs - loud.integratedLufs) <= 0.5 : true, reached ? `${post.integratedLufs} LUFS (objetivo ${loud.integratedLufs})` : `${post.integratedLufs} LUFS: el techo de ${loud.truePeakDb} dBTP impide llegar a ${loud.integratedLufs} LUFS sin compresión (ganancia limitada a ${r2(masterDb)} dB)`, reached ? "error" : "warning");
  }
  const final = decodeWav(fs.readFileSync(mixFile)).channels;
  const perTrack = {};
  for (const t of tracks) {
    const expected = (t.gainDb ?? 0) + masterDb;
    const placed = t.raw.map((c) => c.subarray(0, Math.max(0, Math.min(c.length, L - t.offset))));
    perTrack[t.id] = { role: t.role, start: t.start ?? 0, gainDb: t.gainDb ?? 0, ducked: ducked.includes(t.id), presenceDb: r2(projectionDb(final, placed, t.offset)), expectedDb: r2(expected) };
  }
  if (narrationTrack) {
    const v = perTrack[narrationTrack.id];
    add("voz:intacta", Math.abs(v.presenceDb - v.expectedDb) <= 0.5, `la narración entra con ${v.presenceDb} dB (esperado ${v.expectedDb} dB = ganancia de pista + master; sin ducking ni normalización propia)`);
    add("ducking", activity.windows.length > 0, `${activity.windows.length} tramos de voz (${activity.source === "segments" ? "tiempos manuales de narration.json" : "detección por energía"}) · atenuadas: ${ducked.join(", ") || "ninguna"} (${ducking.amountDb} dB) · sin atenuar: ${tracks.filter((t) => t.role !== "voice" && !ducked.includes(t.id)).map((t) => t.id).join(", ") || "ninguna"}`);
  }

  const report = {
    project,
    generatedAt: new Date().toISOString(),
    inputsHash: hash,
    format: { sampleRate: SR, bitDepth: 16, channels: 2 },
    duration: plan.duration,
    narration: narrationInfo && { script: narrationInfo.script, voiceProfile: narrationInfo.voiceProfile, source: { file: narrationInfo.source.file, sha256: narrationInfo.source.sha256 }, production: narrationInfo.production.file },
    tracks: Object.fromEntries(Object.entries(perTrack).map(([id, t]) => [id, { ...t, sha256: sourceShas[id] }])),
    activity,
    ducking: { amountDb: ducking.amountDb, attack: ducking.attack, release: ducking.release, roles: ducking.roles },
    master: { mode: loud.mode, gainDb: r2(masterDb), targetLufs: loud.integratedLufs, ceilingDb: loud.truePeakDb, before: { integratedLufs: r2(pre.integratedLufs), truePeakDb: r2(pre.truePeakDb) }, after: post, reachedTarget: reached },
    output: { file: path.relative(dir, mixFile), sha256: sha256File(mixFile) },
    files: { mix: "mix/mix.wav" },
    checks,
    timings: { ...timings, total: seconds(performance.now() - t0) },
  };
  report.ok = checks.every((c) => c.ok || c.level === "warning");
  report.cached = false;
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}
