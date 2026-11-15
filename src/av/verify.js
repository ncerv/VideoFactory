// Verificación del MP4 audiovisual: especificación del vídeo (la misma que vf render), vídeo copiado
// sin recodificar, formato del audio, arranque y duración de ambos streams, muestras declaradas y
// relleno AAC, desfase medido por correlación con la mezcla fuente al principio y al final (deriva),
// nivel y sonoridad conservados (sin normalización), energía por bandas, presencia de cada stem en el
// AAC y decodificación completa.
import fs from "node:fs";
import { decodeAudioPcm, decodeCheck, probe, streamPacketHash } from "../adapters/ffmpeg.js";
import { loudness } from "../audio/verify.js";
import { bandEnergy, REFERENCE_BANDS } from "../audio/dsp.js";
import { decodeWav } from "../audio/wav.js";
import { checkSpec, probeVideo } from "../rendering/verify.js";

const r3 = (v) => Math.round(v * 1000) / 1000;
const r2 = (v) => Math.round(v * 100) / 100;
const db = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);

const mono = (channels, i) => channels.reduce((s, c) => s + c[i], 0);

/** Trama AAC: 1024 muestras; el codificador nativo de FFmpeg añade 1024 de retardo inicial. */
export const AAC_FRAME = 1024;

/**
 * Muestras de relleno que entrega el decodificador de la CLI de FFmpeg al final de un AAC en MP4:
 * el codificador produce ceil((N + 1024) / 1024) tramas; la lista de edición descarta el retardo
 * inicial (1024) pero el decodificador no recorta el final. Ej.: 10 s a 48 kHz → 256; 35 s → 384.
 */
export const expectedAacPadding = (samples) => Math.ceil((samples + AAC_FRAME) / AAC_FRAME) * AAC_FRAME - AAC_FRAME - samples;

/**
 * Desfase (en muestras) de `test` respecto de `ref` por correlación cruzada normalizada en la
 * ventana más enérgica de `ref` dentro de [from, to). Positivo: `test` llega tarde.
 */
export function measureLag(ref, test, { maxLag = 2048, window = 12000, from = 0, to = Infinity } = {}) {
  const n = Math.min(ref[0].length, test[0].length, to);
  // Ventana de mayor energía (en bloques de `window`), lejos de los bordes.
  let best = Math.max(maxLag, from);
  let bestE = -1;
  for (let s = Math.max(maxLag, from); s + window + maxLag <= n; s += window) {
    let e = 0;
    for (let i = s; i < s + window; i++) e += mono(ref, i) ** 2;
    if (e > bestE) [bestE, best] = [e, s];
  }
  const r = Float64Array.from({ length: window }, (_, i) => mono(ref, best + i));
  const rNorm = Math.sqrt(r.reduce((a, v) => a + v * v, 0)) || 1;
  let lag = 0;
  let peak = -Infinity;
  for (let l = -maxLag; l <= maxLag; l++) {
    let acc = 0;
    let tE = 0;
    for (let i = 0; i < window; i++) {
      const t = mono(test, best + i + l);
      acc += r[i] * t;
      tE += t * t;
    }
    const c = acc / (rNorm * (Math.sqrt(tE) || 1));
    if (c > peak) [peak, lag] = [c, l];
  }
  return { lag, correlation: r3(peak), windowStart: best, window };
}

/** RMS conjunto de varios canales. */
function rms(channels, from = 0, to = channels[0].length) {
  let s = 0;
  for (const c of channels) for (let i = from; i < to; i++) s += c[i] * c[i];
  return Math.sqrt(s / (channels.length * (to - from)));
}

/** Ganancia (dB) de la proyección de `mix` sobre `stem`: cuánto de ese stem contiene la mezcla. */
function projectionDb(mix, stem) {
  let num = 0;
  let den = 0;
  const n = Math.min(mix[0].length, stem[0].length);
  for (let c = 0; c < stem.length; c++) for (let i = 0; i < n; i++) {
    num += mix[c][i] * stem[c][i];
    den += stem[c][i] * stem[c][i];
  }
  return den > 0 && num > 0 ? db(num / den) : -Infinity;
}

/**
 * @param o { file, sourceVideo, sourceAudio, stems?: { id: wav }, expected: { width, height, fps, duration, frames, sampleRate, channels, audioCodec } }
 */
export async function verifyAvOutput({ file, sourceVideo, sourceAudio, stems = {}, expected }) {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), detail });

  // Vídeo: misma especificación de entrega que vf render, con fotogramas decodificados por ffprobe.
  const video = await probeVideo(file, { countFrames: true });
  const spec = checkSpec({ ...video, decodedFrames: video.frames }, expected);
  for (const c of spec) add(`video:${c.name}`, c.ok, c.detail);
  const [outHash, srcHash] = await Promise.all([streamPacketHash(file, "v:0"), streamPacketHash(sourceVideo, "v:0")]);
  add("video:copiado", outHash === srcHash, outHash === srcHash ? "paquetes H.264 idénticos a los del render visual" : "los paquetes de vídeo difieren del render visual (recodificado)");

  // Streams del contenedor: número, arranque y duración.
  const info = await probe(file);
  const vs = info.streams.filter((s) => s.codec_type === "video");
  const as = info.streams.filter((s) => s.codec_type === "audio");
  add("streams", vs.length === 1 && as.length === 1 && info.streams.length === 2, `${vs.length} vídeo · ${as.length} audio · ${info.streams.length} en total`);
  const v = vs[0];
  const a = as[0] ?? {};
  const vStart = Number(v.start_time);
  const aStart = Number(a.start_time);
  const vDur = Number(v.duration);
  const aDur = Number(a.duration);
  const aacFrame = 1024 / expected.sampleRate;
  add("audio:codec", a.codec_name === expected.audioCodec && a.profile === "LC", `${a.codec_name} ${a.profile ?? ""}`.trim());
  add("audio:frecuencia", Number(a.sample_rate) === expected.sampleRate, `${a.sample_rate} Hz`);
  add("audio:canales", a.channels === expected.channels, `${a.channels} canales (${a.channel_layout ?? "?"})`);
  add("inicio", Math.abs(vStart) < 1e-6 && Math.abs(aStart) < 1e-6, `vídeo ${vStart} s · audio ${aStart} s`);
  add("duracion:streams", Math.abs(vDur - expected.duration) <= 1 / expected.fps && Math.abs(aDur - vDur) < aacFrame, `vídeo ${r3(vDur)} s · audio ${r3(aDur)} s (tolerancia de audio: 1 trama AAC = ${r3(aacFrame * 1000)} ms)`);

  // Audio decodificado frente a la mezcla fuente: muestras, desfase y nivel.
  const src = decodeWav(fs.readFileSync(sourceAudio));
  const dec = await decodeAudioPcm(file, { channels: expected.channels, sampleRate: expected.sampleRate });
  const srcFrames = src.channels[0].length;
  // El MP4 declara la duración exacta (lista de edición: retardo del codificador + duración). El
  // decodificador de la CLI de FFmpeg recorta el retardo inicial pero entrega el relleno final de la
  // última trama AAC: debe ser < 1 trama y silencio.
  const [tbNum, tbDen] = String(a.time_base).split("/").map(Number);
  const declared = Math.round((Number(a.duration_ts) * tbNum * expected.sampleRate) / tbDen);
  const padding = dec[0].length - srcFrames;
  const expectedPadding = expectedAacPadding(srcFrames);
  const paddingPeak = padding > 0 ? Math.max(...dec.map((c) => c.subarray(srcFrames).reduce((m, v) => Math.max(m, Math.abs(v)), 0))) : 0;
  add("audio:muestras", declared === srcFrames && padding === expectedPadding && paddingPeak < 1e-4, `${declared} muestras declaradas (fuente ${srcFrames}) · ${dec[0].length} decodificadas: relleno AAC final de ${padding} muestras (esperado ${expectedPadding}), pico ${paddingPeak > 0 ? r2(db(paddingPeak)) : "-∞"} dBFS`);
  // Desfase al principio y al final de la pieza: detecta tanto un retardo fijo como una deriva.
  const third = Math.floor(srcFrames / 3);
  const lagStart = measureLag(src.channels, dec, { to: third });
  const lagEnd = measureLag(src.channels, dec, { from: srcFrames - third });
  const lag = measureLag(src.channels, dec);
  const ms = (l) => r3((l / expected.sampleRate) * 1000);
  add("sincronia", [lag, lagStart, lagEnd].every((x) => x.lag === 0 && x.correlation > 0.99), `desfase ${lag.lag} muestras (${ms(lag.lag)} ms, correlación ${lag.correlation}) · inicio ${lagStart.lag} (${lagStart.correlation}) · final ${lagEnd.lag} (${lagEnd.correlation}) · deriva ${lagEnd.lag - lagStart.lag} muestras`);
  const n = Math.min(srcFrames, dec[0].length);
  const levelDiff = db(rms(dec, 0, n)) - db(rms(src.channels, 0, n));
  const residual = rms(dec.map((c, k) => Float32Array.from({ length: n }, (_, i) => c[i] - src.channels[k][i])));
  add("audio:nivel", Math.abs(levelDiff) < 0.1, `diferencia de RMS ${r2(levelDiff)} dB (sin normalización) · residuo AAC ${r2(db(residual) - db(rms(src.channels, 0, n)))} dB`);

  const [outLoud, srcLoud] = await Promise.all([loudness(file), loudness(sourceAudio)]);
  add("audio:sonoridad", outLoud && srcLoud && Math.abs(outLoud.integratedLufs - srcLoud.integratedLufs) <= 0.2, `${outLoud?.integratedLufs} LUFS (fuente ${srcLoud?.integratedLufs}) · true peak ${outLoud?.truePeakDb} dBTP (fuente ${srcLoud?.truePeakDb})`);

  // Energía por bandas: AAC a 192 kb/s debe conservar las bandas de la música y la voz (< 8 kHz).
  const srcBands = bandEnergy(src.channels, expected.sampleRate, REFERENCE_BANDS);
  const decBands = bandEnergy(dec.map((c) => c.subarray(0, srcFrames)), expected.sampleRate, REFERENCE_BANDS);
  const bands = Object.fromEntries(Object.keys(srcBands).map((k) => [k, { sourceDb: srcBands[k], outputDb: decBands[k], diffDb: r2(decBands[k] - srcBands[k]) }]));
  const keyBands = Object.entries(bands).filter(([k]) => Number(k.split("-")[1]) <= 8000);
  add("audio:bandas", keyBands.every(([, b]) => Math.abs(b.diffDb) <= 0.5), keyBands.map(([k, b]) => `${k} Hz ${b.diffDb >= 0 ? "+" : ""}${b.diffDb} dB`).join(" · "));

  // Presencia de cada stem: proyección de la salida sobre el stem frente a la de la mezcla original.
  const stemPresence = {};
  for (const [id, f] of Object.entries(stems)) {
    const stem = decodeWav(fs.readFileSync(f)).channels;
    const inSource = projectionDb(src.channels, stem);
    const inOutput = projectionDb(dec, stem);
    stemPresence[id] = { sourceDb: r2(inSource), outputDb: r2(inOutput), diffDb: r2(inOutput - inSource) };
  }
  if (Object.keys(stems).length) {
    add("audio:stems", Object.values(stemPresence).every((s) => Math.abs(s.diffDb) <= 0.5), Object.entries(stemPresence).map(([id, s]) => `${id} ${s.diffDb >= 0 ? "+" : ""}${s.diffDb} dB`).join(" · "));
  }

  const decoded = await decodeCheck(file);
  add("reproduccion", decoded.ok, decoded.ok ? "decodificación completa sin errores" : decoded.errors.slice(0, 300));

  const audio = {
    codec: a.codec_name,
    profile: a.profile,
    sampleRate: Number(a.sample_rate),
    channels: a.channels,
    channelLayout: a.channel_layout,
    bitRate: Number(a.bit_rate),
    startTime: aStart,
    duration: aDur,
    declaredSamples: declared,
    decodedSamples: dec[0].length,
    paddingSamples: padding,
    expectedPaddingSamples: expectedPadding,
    lagSamples: lag.lag,
    lagStartSamples: lagStart.lag,
    lagEndSamples: lagEnd.lag,
    correlation: lag.correlation,
    bands,
    stems: stemPresence,
    levelDiffDb: r2(levelDiff),
    integratedLufs: outLoud?.integratedLufs ?? null,
    truePeakDb: outLoud?.truePeakDb ?? null,
    source: { integratedLufs: srcLoud?.integratedLufs ?? null, truePeakDb: srcLoud?.truePeakDb ?? null },
  };
  return { ok: checks.every((c) => c.ok), checks, video: { ...video, startTime: vStart, streamDuration: vDur }, audio, container: { format: info.format.format_name, duration: Number(info.format.duration), sizeBytes: Number(info.format.size), bitRate: Number(info.format.bit_rate) } };
}
