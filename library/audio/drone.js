// Drone grave: osciladores "fat" desafinados + sub-octava, filtro paso bajo que respira con un LFO.
import { db, gate } from "./envelope.js";

/** Compensación medida: con ella, gainDb ≈ pico del drone aislado. */
const MAKEUP_DB = 3;

/**
 * @param o { notes, start, end, attack, release, gainDb, wave, spread, count, cutoff, q,
 *            lfo:{rate, depth}, sub (dB o null), pan, send, sendDb, out }
 */
export function drone(ctx, o = {}) {
  const { Tone } = ctx;
  const { notes = ["A1"], start = 0, end = ctx.duration, attack = 3, release = 3, gainDb = -14, wave = "sawtooth", spread = 18, count = 3, cutoff = 320, q = 0.8, lfo = { rate: 0.07, depth: 0.45 }, sub = -6, pan = 0, send = null, sendDb = -8, out = ctx.out } = o;
  const filter = new Tone.Filter({ frequency: cutoff, type: "lowpass", Q: q, rolloff: -24 });
  const amp = new Tone.Gain(0);
  const panner = new Tone.Panner(pan);
  filter.chain(amp, panner, out);
  if (send) panner.connect(new Tone.Gain(db(sendDb)).connect(send));
  if (lfo) new Tone.LFO(lfo.rate, cutoff * (1 - lfo.depth), cutoff * (1 + lfo.depth)).start(start).stop(end).connect(filter.frequency);
  const voiceGain = db(gainDb + MAKEUP_DB) / Math.sqrt(notes.length);
  for (const note of notes) {
    const f = Tone.Frequency(note).toFrequency();
    const osc = new Tone.FatOscillator({ frequency: f, type: wave, spread, count });
    osc.volume.value = -6;
    osc.connect(filter).start(start).stop(end);
    if (sub !== null) {
      const s = new Tone.Oscillator(f / 2, "sine");
      s.volume.value = sub;
      s.connect(filter).start(start).stop(end);
    }
  }
  gate(amp.gain, { start, end, level: voiceGain, attack, release });
  return panner;
}
