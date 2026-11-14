// Generadores de audio procedurales reutilizables (Tone.js, render offline, deterministas).
// Firma común: generador(ctx, opciones). ctx lo crea src/audio/render.js dentro de Tone.Offline.
export { space, echo } from "./space.js";
export { drone } from "./drone.js";
export { wind } from "./wind.js";
export { pulse } from "./pulse.js";
export { resonance } from "./resonance.js";
export { whoosh } from "./whoosh.js";
export { impact } from "./impact.js";
export { gate, randomWalk, db } from "./envelope.js";
