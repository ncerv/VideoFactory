// Whoosh / transición: ruido con barrido de filtro paso banda, envolvente de crescendo y paso estéreo.
import { db } from "./envelope.js";

/** Compensación medida: con ella, gainDb ≈ pico del whoosh aislado. */
const MAKEUP_DB = 18;

/**
 * @param o { start, duration, from, to (Hz del barrido), q, gainDb, peakAt (0..1), pan:[desde,hasta],
 *            color, seed, send, sendDb, out }
 */
export function whoosh(ctx, o = {}) {
  const { Tone } = ctx;
  const { start = 0, duration = 1.5, from = 250, to = 2800, q = 1.1, gainDb = -16, peakAt = 0.72, pan = [-0.6, 0.6], color = "pink", seed = 7, send = null, sendDb = -6, out = ctx.out } = o;
  const end = start + duration;
  const src = new Tone.ToneBufferSource(ctx.noise(color, duration + 0.05, seed));
  const band = new Tone.Filter({ frequency: from, type: "bandpass", Q: q });
  const amp = new Tone.Gain(0);
  const panner = new Tone.Panner(pan[0]);
  src.chain(band, amp, panner, out);
  if (send) panner.connect(new Tone.Gain(db(sendDb)).connect(send));
  band.frequency.setValueAtTime(from, start);
  band.frequency.exponentialRampToValueAtTime(to, start + duration * peakAt);
  band.frequency.exponentialRampToValueAtTime(Math.max(from, to * 0.6), end);
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(db(gainDb + MAKEUP_DB), start + duration * peakAt);
  amp.gain.exponentialRampToValueAtTime(0.0001, end);
  panner.pan.setValueAtTime(pan[0], start);
  panner.pan.linearRampToValueAtTime(pan[1], end);
  src.start(start).stop(end);
  return panner;
}
