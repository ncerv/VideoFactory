// Resonancia / campana lejana: síntesis aditiva de parciales inarmónicos con caídas exponenciales,
// batido entre pares ligeramente desafinados, transitorio de golpe y control de distancia.
import { db } from "./envelope.js";

/** Compensación medida: con ella, gainDb ≈ pico de la campana aislada (distancia 0). */
const MAKEUP_DB = -4;

const BELL = { ratios: [0.5, 1, 1.19, 1.56, 2, 2.74, 3.76, 5.4], amps: [0.35, 1, 0.45, 0.4, 0.3, 0.22, 0.12, 0.07], decays: [9, 7, 5, 4.5, 3.5, 2.6, 1.8, 1.2] };

/**
 * @param o { at, note, gainDb, distance (0 cerca … 1 lejos), beat (Hz de batido), pan, partials, send, sendDb, out }
 */
export function resonance(ctx, o = {}) {
  const { Tone } = ctx;
  const { at = 0, note = "E5", gainDb = -18, distance = 0.6, beat = 0.7, pan = 0, partials = BELL, send = null, sendDb = -4, out = ctx.out } = o;
  const f0 = Tone.Frequency(note).toFrequency();
  const highcut = 9000 - distance * 6500;
  const dry = new Tone.Gain(1 - distance * 0.65);
  const tone = new Tone.Filter(highcut, "lowpass");
  const panner = new Tone.Panner(pan);
  tone.chain(panner, dry, out);
  if (send) panner.connect(new Tone.Gain(db(sendDb + distance * 4)).connect(send));
  const level = db(gainDb + MAKEUP_DB);
  partials.ratios.forEach((ratio, i) => {
    for (const side of [-1, 1]) {
      const osc = new Tone.Oscillator(f0 * ratio + (side * beat) / 2, "sine");
      const g = new Tone.Gain(0);
      osc.chain(g, tone);
      const a = (level * partials.amps[i]) / 2;
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(a, at + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, at + partials.decays[i]);
      osc.start(at).stop(at + partials.decays[i] + 0.05);
    }
  });
  // transitorio del golpe: ráfaga corta de ruido filtrado
  const click = new Tone.ToneBufferSource(ctx.noise("white", 0.05, Math.round(f0)));
  const cf = new Tone.Filter(f0 * 3, "bandpass");
  const cg = new Tone.Gain(0);
  click.chain(cf, cg, tone);
  cg.gain.setValueAtTime(level * 0.4, at);
  cg.gain.exponentialRampToValueAtTime(0.0001, at + 0.04);
  click.start(at).stop(at + 0.05);
  return panner;
}
