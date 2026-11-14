// Pulso de tensión: golpes graves de membrana con patrón (p. ej. latido "lub-dub") e intensidad creciente.
import { db } from "./envelope.js";

/**
 * @param o { start, end, bpm, pattern:[{offset, velocity}], pitch, intensity:[from,to], gainDb,
 *            lowpass, decay, accelerando (bpm al final o null), send, sendDb, out }
 */
export function pulse(ctx, o = {}) {
  const { Tone } = ctx;
  const { start = 0, end = ctx.duration, bpm = 56, pattern = [{ offset: 0, velocity: 1 }, { offset: 0.27, velocity: 0.55 }], pitch = 46, intensity = [0.25, 1], gainDb = -12, lowpass = 220, decay = 0.45, accelerando = null, send = null, sendDb = -14, out = ctx.out } = o;
  const synth = new Tone.MembraneSynth({ pitchDecay: 0.06, octaves: 2.5, envelope: { attack: 0.003, decay, sustain: 0, release: 0.1 } });
  synth.volume.value = gainDb;
  const lp = new Tone.Filter(lowpass, "lowpass");
  synth.chain(lp, out);
  if (send) lp.connect(new Tone.Gain(db(sendDb)).connect(send));
  const hits = [];
  let t = start;
  while (t < end) {
    const p = (t - start) / Math.max(1e-6, end - start);
    for (const { offset, velocity } of pattern) {
      const at = t + offset;
      if (at < end) hits.push(at);
      if (at < end) synth.triggerAttackRelease(pitch, decay, at, velocity * (intensity[0] + (intensity[1] - intensity[0]) * p));
    }
    const current = accelerando ? bpm + (accelerando - bpm) * p : bpm;
    t += 60 / current;
  }
  return hits;
}
