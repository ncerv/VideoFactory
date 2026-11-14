// Composición "bosque nocturno" para la prueba del motor de audio.
//
// Solo describe qué suena y cuándo: los tiempos están en timing.json y la síntesis la hacen los
// generadores de library/audio. Cada stem se renderiza por separado con su propia instancia del
// mismo espacio acústico (misma semilla), de modo que la suma de stems es exactamente la mezcla.
//
// Dramaturgia (10 s): el drone y el viento abren el plano; cuando la nube vela la luna (3,4 s)
// empieza un pulso grave que acelera poco a poco; al aparecer los ojos (5,7 s) suena una campana
// lejana en tritono con el drone; un crescendo discreto de ruido lleva al cierre.
// Espacio para la voz: la música vive por debajo de ~300 Hz (drone, pulso) o es escasa y aguda
// (campana); el viento es de banda estrecha y bajo nivel.

export default function composition({ timing: T }) {
  const room = (ctx) => ctx.lib.space(ctx, T.space);
  return {
    id: "night-forest-audio",
    stems: [
      { id: "drone", role: "music", gainDb: 0, build: (ctx) => ctx.lib.drone(ctx, { ...T.drone, send: room(ctx) }) },
      { id: "wind", role: "ambience", gainDb: 0, build: (ctx) => ctx.lib.wind(ctx, { ...T.wind, seed: 3, send: room(ctx) }) },
      { id: "pulse", role: "music", gainDb: 0, build: (ctx) => ctx.lib.pulse(ctx, { ...T.pulse, send: room(ctx) }) },
      { id: "resonance", role: "sfx", gainDb: 0, build: (ctx) => ctx.lib.resonance(ctx, { ...T.resonance, send: room(ctx) }) },
      { id: "transition", role: "sfx", gainDb: 0, build: (ctx) => ctx.lib.whoosh(ctx, { ...T.transition, color: "brown", seed: 5, pan: [0.4, -0.2], send: room(ctx) }) },
    ],
  };
}
