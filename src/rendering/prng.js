// PRNG determinista (mulberry32) para generar geometría reproducible a partir de una semilla.
// Es el mismo algoritmo que usan los runtimes de navegador (vf-textures.js, vf-motion.js).

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Generador con utilidades: rng.range(a, b), rng.int(a, b), rng.pick(arr), rng.chance(p). */
export function createRng(seed) {
  const next = mulberry32(seed);
  const rng = () => next();
  rng.range = (a, b) => a + (b - a) * next();
  rng.int = (a, b) => Math.floor(a + (b - a + 1) * next());
  rng.pick = (arr) => arr[Math.floor(next() * arr.length)];
  rng.chance = (p) => next() < p;
  /** Deriva un generador independiente y estable para un subcomponente. */
  rng.fork = (salt) => createRng(Math.floor(next() * 2 ** 31) ^ salt);
  return rng;
}
