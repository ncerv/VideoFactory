// Música y efectos de "El Curupira": síntesis con Tone.js (render offline), sin muestras.
//
// Solo describe qué suena y cuándo; los tiempos están en audio-timing.json. Usa los generadores de
// library/audio (drone, wind, pulse, impact, resonance, whoosh, space). El silbido tonal del
// Curupira se sintetiza aquí (oscilador sinusoidal con glissando y vibrato): es propio de esta
// historia y no amplía el motor.
//
// Dramaturgia sonora: el río y los insectos acompañan la orilla; el río se apaga cuando Raimundo
// se pierde ("el agua no se oía") y vuelve al amanecer. Un pulso grave acelera en la escalada.
// Los efectos caen en las pausas de la voz para no taparla.

/** Silbido agudo: seno con glissando (f0 → f1 → f2), vibrato leve y envolvente suave. */
function whistle(ctx, { at, dur, gainDb, f, pan = 0, send, out = ctx.out }) {
  const { Tone } = ctx;
  const osc = new Tone.Oscillator(f[0], "sine");
  const vib = new Tone.Vibrato({ frequency: 6.5, depth: 0.08 });
  const amp = new Tone.Gain(0);
  const panner = new Tone.Panner(pan);
  osc.chain(vib, amp, panner, out);
  if (send) panner.connect(new Tone.Gain(10 ** (-8 / 20)).connect(send));
  osc.frequency.setValueAtTime(f[0], at);
  osc.frequency.exponentialRampToValueAtTime(f[1], at + dur * 0.35);
  osc.frequency.exponentialRampToValueAtTime(f[2], at + dur);
  const g = 10 ** (gainDb / 20);
  amp.gain.setValueAtTime(0, at);
  amp.gain.linearRampToValueAtTime(g, at + 0.08);
  amp.gain.setValueAtTime(g, at + dur * 0.7);
  amp.gain.linearRampToValueAtTime(0, at + dur);
  osc.start(at).stop(at + dur + 0.05);
}

export default function composition({ timing: T }) {
  const room = (ctx) => ctx.lib.space(ctx, T.space);
  return {
    id: "curupira-audio",
    stems: [
      { id: "drone", role: "music", build: (ctx) => { const s = room(ctx); ctx.lib.drone(ctx, { ...T.drone, send: s }); ctx.lib.drone(ctx, { ...T.dawn, send: s }); } },
      { id: "river", role: "ambience", build: (ctx) => { const s = room(ctx); T.river.forEach((w, i) => ctx.lib.wind(ctx, { ...T.riverSound, ...w, seed: 21 + i, send: s })); } },
      { id: "insects", role: "ambience", build: (ctx) => ctx.lib.wind(ctx, { ...T.insects, send: room(ctx) }) },
      { id: "pulse", role: "music", build: (ctx) => ctx.lib.pulse(ctx, { ...T.pulse, send: room(ctx) }) },
      { id: "whistle", role: "sfx", build: (ctx) => { const s = room(ctx); T.whistles.forEach((w) => whistle(ctx, { ...w, send: s })); } },
      { id: "foley", role: "sfx", build: (ctx) => { const s = room(ctx); for (const k of ["drop", "creak", "thud"]) ctx.lib.impact(ctx, { ...T[k], send: s }); } },
      { id: "reveal", role: "sfx", build: (ctx) => { const s = room(ctx); ctx.lib.resonance(ctx, { ...T.name, send: s }); ctx.lib.whoosh(ctx, { ...T.trace, send: s }); } },
    ],
  };
}
