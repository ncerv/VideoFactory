// Impacto / golpe: cuerpo senoidal con caída de tono, sub y chasquido de ruido.
import { db } from "./envelope.js";

/** @param o { at, gainDb, body (Hz), drop (multiplicador inicial), decay, click (dB o null), send, sendDb, out } */
export function impact(ctx, o = {}) {
  const { Tone } = ctx;
  const { at = 0, gainDb = -10, body = 48, drop = 3, decay = 1.1, click = -14, send = null, sendDb = -8, out = ctx.out } = o;
  const level = db(gainDb);
  const osc = new Tone.Oscillator(body * drop, "sine");
  const g = new Tone.Gain(0);
  osc.chain(g, out);
  if (send) g.connect(new Tone.Gain(db(sendDb)).connect(send));
  osc.frequency.setValueAtTime(body * drop, at);
  osc.frequency.exponentialRampToValueAtTime(body, at + 0.18);
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(level, at + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
  osc.start(at).stop(at + decay + 0.05);
  if (click !== null) {
    const n = new Tone.ToneBufferSource(ctx.noise("white", 0.08, Math.round(body * 100)));
    const lp = new Tone.Filter(2500, "lowpass");
    const ng = new Tone.Gain(0);
    n.chain(lp, ng, out);
    ng.gain.setValueAtTime(db(gainDb + click), at);
    ng.gain.exponentialRampToValueAtTime(0.0001, at + 0.07);
    n.start(at).stop(at + 0.08);
  }
  return g;
}
