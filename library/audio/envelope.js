// Utilidades de programación compartidas por los generadores (tiempos absolutos en segundos).

/** Envolvente de nivel en un AudioParam de ganancia: 0 → nivel (attack) → mantiene → 0 (release). */
export function gate(param, { start, end, level, attack, release, curve = "linear" }) {
  const a = Math.max(0.001, Math.min(attack, (end - start) / 2));
  const r = Math.max(0.001, Math.min(release, (end - start) / 2));
  param.setValueAtTime(0, start);
  if (curve === "exponential") {
    param.setValueAtTime(0.0001, start);
    param.exponentialRampToValueAtTime(level, start + a);
    param.setValueAtTime(level, end - r);
    param.exponentialRampToValueAtTime(0.0001, end);
    param.setValueAtTime(0, end);
  } else {
    param.linearRampToValueAtTime(level, start + a);
    param.setValueAtTime(level, end - r);
    param.linearRampToValueAtTime(0, end);
  }
}

/**
 * Recorrido aleatorio suave con semilla: puntos cada `step` s entre [min, max], programados como
 * rampas exponenciales en un AudioParam. Útil para ráfagas de viento o derivas de filtro.
 */
export function randomWalk(param, rng, { start, end, step, min, max, smooth = 0.6 }) {
  let v = Math.sqrt(min * max);
  param.setValueAtTime(v, start);
  for (let t = start + step; t <= end + 1e-6; t += step) {
    const target = min * (max / min) ** rng();
    v = v * smooth + target * (1 - smooth);
    param.exponentialRampToValueAtTime(Math.max(v, 1e-4), Math.min(t, end));
  }
}

export const db = (x) => 10 ** (x / 20);
