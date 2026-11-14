// Procesado de señal determinista en el dominio de las muestras (Float32Array por canal).
import { mulberry32 } from "../rendering/prng.js";

/** Ruido con semilla: white (blanco), pink (rosa, filtro de Paul Kellet) o brown (integrado). */
export function noiseChannel(kind, length, seed) {
  const r = mulberry32(seed);
  const out = new Float32Array(length);
  if (kind === "white") {
    for (let i = 0; i < length; i++) out[i] = r() * 2 - 1;
  } else if (kind === "pink") {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < length; i++) {
      const w = r() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  } else if (kind === "brown") {
    let last = 0;
    for (let i = 0; i < length; i++) {
      last = (last + 0.02 * (r() * 2 - 1)) / 1.02;
      out[i] = last * 3.5;
    }
  } else {
    throw new Error(`Ruido desconocido: ${kind}`);
  }
  return out;
}

/** Ruido estéreo decorrelado (cada canal con su semilla derivada). */
export function noiseStereo(kind, seconds, sampleRate, seed) {
  const n = Math.round(seconds * sampleRate);
  return [noiseChannel(kind, n, seed), noiseChannel(kind, n, seed ^ 0x9e3779b9)];
}

/**
 * Respuesta al impulso sintética para reverberación por convolución (sin muestras externas):
 * reflexiones tempranas dispersas + cola de ruido con caída exponencial y amortiguación
 * de agudos creciente (filtro de un polo que se cierra con el tiempo). Estéreo decorrelado.
 */
export function impulseResponse({ seconds = 3, decay = 2.5, preDelay = 0.02, damping = 0.6, early = 8, seed = 1, sampleRate }) {
  const n = Math.round(seconds * sampleRate);
  const pre = Math.round(preDelay * sampleRate);
  return [0, 1].map((ch) => {
    const r = mulberry32(seed * 31 + ch * 7919);
    const out = new Float32Array(n);
    let lp = 0;
    for (let i = pre; i < n; i++) {
      const t = (i - pre) / sampleRate;
      const env = Math.exp((-t * 6.9) / decay); // -60 dB en `decay` segundos
      const coeff = Math.min(0.98, damping * (t / seconds) + 0.05);
      lp += (1 - coeff) * ((r() * 2 - 1) - lp);
      out[i] = lp * env;
    }
    for (let k = 0; k < early; k++) {
      const pos = pre + Math.floor(r() * 0.08 * sampleRate);
      if (pos < n) out[pos] += (r() * 2 - 1) * 0.5 * (1 - k / early);
    }
    let peak = 0;
    for (const s of out) peak = Math.max(peak, Math.abs(s));
    if (peak > 0) for (let i = 0; i < n; i++) out[i] /= peak;
    return out;
  });
}

/** Curva de fundido de potencia constante (seno), 0→1. */
const fadeCurve = (x) => Math.sin((Math.min(1, Math.max(0, x)) * Math.PI) / 2) ** 2;

/** Aplica fade-in y fade-out (en segundos) en el sitio. */
export function applyFades(channels, sampleRate, { fadeIn = 0, fadeOut = 0 } = {}) {
  const fi = Math.round(fadeIn * sampleRate);
  const fo = Math.round(fadeOut * sampleRate);
  for (const ch of channels) {
    const n = ch.length;
    for (let i = 0; i < fi && i < n; i++) ch[i] *= fadeCurve(i / fi);
    for (let i = 0; i < fo && i < n; i++) ch[n - 1 - i] *= fadeCurve(i / fo);
  }
  return channels;
}

/**
 * Envolvente de ducking (atenuación mientras habla el narrador): ganancia por muestra que baja
 * `amountDb` dentro de cada ventana [start, end], con rampas de ataque y liberación.
 */
export function duckingEnvelope(length, sampleRate, windows, { amountDb = -8, attack = 0.25, release = 0.6 } = {}) {
  const env = new Float32Array(length).fill(1);
  const low = 10 ** (amountDb / 20);
  for (const { start, end } of windows) {
    const a0 = Math.round((start - attack) * sampleRate);
    const a1 = Math.round(start * sampleRate);
    const r0 = Math.round(end * sampleRate);
    const r1 = Math.round((end + release) * sampleRate);
    for (let i = Math.max(0, a0); i < Math.min(length, r1); i++) {
      let g;
      if (i < a1) g = 1 + (low - 1) * fadeCurve((i - a0) / Math.max(1, a1 - a0));
      else if (i <= r0) g = low;
      else g = low + (1 - low) * fadeCurve((i - r0) / Math.max(1, r1 - r0));
      env[i] = Math.min(env[i], g);
    }
  }
  return env;
}

export function multiply(channels, envelope) {
  for (const ch of channels) for (let i = 0; i < ch.length; i++) ch[i] *= envelope[i];
  return channels;
}

export function scale(channels, gain) {
  if (gain !== 1) for (const ch of channels) for (let i = 0; i < ch.length; i++) ch[i] *= gain;
  return channels;
}

/** Suma de pistas (mismos canales y longitud). */
export function sum(tracks) {
  const out = tracks[0].map((ch) => new Float32Array(ch.length));
  for (const t of tracks) t.forEach((ch, c) => { for (let i = 0; i < ch.length; i++) out[c][i] += ch[i]; });
  return out;
}

/** Estadísticas: pico, RMS, desplazamiento de continua y energía en ventanas inicial/final. */
export function analyze(channels, sampleRate, { edge = 0.05 } = {}) {
  let peak = 0;
  let sq = 0;
  let dc = 0;
  let count = 0;
  for (const ch of channels) {
    for (const s of ch) {
      const a = Math.abs(s);
      if (a > peak) peak = a;
      sq += s * s;
      dc += s;
      count++;
    }
  }
  const rmsOf = (from, to) => {
    let e = 0;
    let k = 0;
    for (const ch of channels) for (let i = from; i < to; i++) { e += ch[i] * ch[i]; k++; }
    return k ? Math.sqrt(e / k) : 0;
  };
  const n = channels[0].length;
  const w = Math.round(edge * sampleRate);
  const db = (v) => (v > 0 ? Math.round(20 * Math.log10(v) * 100) / 100 : -Infinity);
  return {
    peak,
    peakDb: db(peak),
    rmsDb: db(Math.sqrt(sq / count)),
    dcOffset: dc / count,
    headRmsDb: db(rmsOf(0, w)),
    tailRmsDb: db(rmsOf(n - w, n)),
    firstSample: Math.max(...channels.map((ch) => Math.abs(ch[0]))),
    lastSample: Math.max(...channels.map((ch) => Math.abs(ch[n - 1]))),
  };
}

/** FFT real in situ (radix-2) sobre re/im de longitud potencia de 2. */
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let b = n >> 1;
    for (; j & b; b >>= 1) j ^= b;
    j ^= b;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(a * k);
        const wi = Math.sin(a * k);
        const p = i + k;
        const q = p + len / 2;
        const vr = re[q] * wr - im[q] * wi;
        const vi = re[q] * wi + im[q] * wr;
        re[q] = re[p] - vr;
        im[q] = im[p] - vi;
        re[p] += vr;
        im[p] += vi;
      }
    }
  }
}

/**
 * Reparto de energía por bandas (FFT con ventana de Hann, promediada en bloques; canales sumados).
 * Devuelve dB respecto de la energía total entre 20 Hz y 20 kHz.
 */
export function bandEnergy(channels, sampleRate, bands, { size = 16384 } = {}) {
  const acc = new Float64Array(size / 2);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  const n = channels[0].length;
  for (let start = 0; start + size <= n; start += size / 2) {
    re.fill(0);
    im.fill(0);
    for (const ch of channels) for (let i = 0; i < size; i++) re[i] += ch[start + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)));
    fft(re, im);
    for (let k = 0; k < size / 2; k++) acc[k] += re[k] * re[k] + im[k] * im[k];
  }
  const bin = (f) => Math.min(size / 2, Math.max(0, Math.round((f * size) / sampleRate)));
  const sumBand = (lo, hi) => {
    let e = 0;
    for (let k = bin(lo); k < bin(hi); k++) e += acc[k];
    return e;
  };
  const total = sumBand(20, 20000) || 1e-30;
  return Object.fromEntries(bands.map(([lo, hi]) => [`${lo}-${hi}`, Math.round(10 * Math.log10(sumBand(lo, hi) / total + 1e-30) * 10) / 10]));
}

/** Bandas de referencia; 300-3000 Hz es la zona de inteligibilidad de la voz. */
export const REFERENCE_BANDS = [[20, 150], [150, 300], [300, 3000], [3000, 8000], [8000, 20000]];
