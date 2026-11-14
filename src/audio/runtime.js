// Runtime de audio: Tone.js en Node sobre node-web-audio-api (Web Audio API nativa en Rust).
//
// Comprobado con tone@15.1.22 y node-web-audio-api@2.2.0:
//  - Tone usa standardized-audio-context, que busca los constructores en `window`. Basta con un
//    objeto `window` aislado que contenga solo las clases de node-web-audio-api (no se toca nada más).
//  - Tone.Offline(callback, duration, channels, sampleRate) renderiza sin reproducción en tiempo real.
//  - Para el determinismo se evitan las piezas de Tone que usan Math.random (Tone.Noise, Tone.Reverb,
//    humanize/probability de ToneEvent, patrones aleatorios) y las que dependen de AudioWorklet
//    (FeedbackCombFilter, Freeverb, JCReverb, BitCrusher). El ruido y las reverberaciones se generan
//    con PRNG con semilla (src/audio/dsp.js).

let tonePromise = null;

/** Carga Tone.js una sola vez por proceso, preparando el entorno Web Audio de Node. */
export function loadTone() {
  if (!tonePromise) {
    tonePromise = (async () => {
      const nwa = await import("node-web-audio-api");
      if (typeof globalThis.window === "undefined") {
        globalThis.window = Object.fromEntries(Object.entries(nwa).filter(([, v]) => typeof v === "function"));
      }
      return import("tone");
    })();
  }
  return tonePromise;
}

/**
 * Ejecuta fn con Math.random deshabilitado: cualquier uso accidental de azar sin semilla
 * (propio o de una librería) hace fallar el render en lugar de producir audio no reproducible.
 */
export async function withDeterminismGuard(fn) {
  const original = Math.random;
  Math.random = () => {
    throw new Error("Math.random usado durante el render de audio: usa el rng con semilla del contexto");
  };
  try {
    return await fn();
  } finally {
    Math.random = original;
  }
}

export const dbToGain = (db) => 10 ** (db / 20);
export const gainToDb = (g) => (g > 0 ? 20 * Math.log10(g) : -Infinity);
