// Árboles desnudos y retorcidos, generados por ramificación recursiva (siluetas de primer plano).
// Cada rama es un contorno continuo y suavizado que se afina hacia la punta; las ramas hijas
// nacen a lo largo de la madre, tienden a crecer hacia arriba y respetan unos límites laterales
// para enmarcar la escena sin cruzar su centro.
import { polygon, smoothPath } from "../../src/rendering/svg.js";

/**
 * @param rng generador con semilla
 * @param o {
 *   x, baseY, angle (rad; -PI/2 = vertical), length, width, levels,
 *   spread (apertura de las ramas hijas), curl (curvatura aleatoria), upPull (tendencia vertical),
 *   taper (afinado de cada rama, 0-1),
 *   bounds: { minX, maxX, minY } límites hacia los que no deben crecer las ramas
 * }
 * @returns {string} subtrayectorias "d" (rellenar con un único color, fill-rule nonzero)
 */
export function bareTreePath(rng, o) {
  const parts = [];
  const spread = o.spread ?? 0.6;
  const curl = o.curl ?? 0.16;
  const upPull = o.upPull ?? 0.08;
  const bounds = o.bounds ?? {};

  function steer(x, y, a) {
    // Tendencia hacia la vertical y repulsión suave de los límites.
    a += (-Math.PI / 2 - a) * upPull;
    if (bounds.maxX !== undefined && x > bounds.maxX) a += (-Math.PI / 2 - 0.5 - a) * 0.35;
    if (bounds.minX !== undefined && x < bounds.minX) a += (-Math.PI / 2 + 0.5 - a) * 0.35;
    if (bounds.minY !== undefined && y < bounds.minY) a += (a < -Math.PI / 2 ? -1 : 1) * 0.25;
    return a;
  }

  function branch(x, y, angle, length, width, level) {
    const segments = level >= o.levels - 1 ? 9 : 6;
    const spine = [[x, y, width]];
    let cx = x;
    let cy = y;
    let a = angle;
    for (let s = 1; s <= segments; s++) {
      a = steer(cx, cy, a + rng.range(-curl, curl));
      cx += Math.cos(a) * (length / segments);
      cy += Math.sin(a) * (length / segments);
      const t = s / segments;
      spine.push([cx, cy, width * (1 - t * (o.taper ?? 0.6))]);
    }
    // contorno: lado izquierdo hacia la punta y derecho de vuelta
    const left = [];
    const right = [];
    for (let i = 0; i < spine.length; i++) {
      const [px, py, w] = spine[i];
      const [qx, qy] = spine[Math.min(i + 1, spine.length - 1)];
      const [rx, ry] = spine[Math.max(i - 1, 0)];
      const dir = Math.atan2(qy - ry, qx - rx);
      const nx = -Math.sin(dir);
      const ny = Math.cos(dir);
      const bump = 1 + rng.range(-0.08, 0.08);
      left.push([px + (nx * w * bump) / 2, py + (ny * w * bump) / 2]);
      right.push([px - (nx * w * bump) / 2, py - (ny * w * bump) / 2]);
    }
    parts.push(smoothPath([...left, ...right.reverse()], { closed: true, tension: 0.4 }));

    if (level <= 1) return;
    // ramas hijas repartidas a lo largo de la madre
    const forks = level >= o.levels - 1 ? [0.38, 0.55, 0.72, 0.88, 1] : [0.5, 0.78, 1];
    forks.forEach((f) => {
      if (f < 1 && rng.chance(0.25)) return;
      const idx = Math.round(f * segments);
      const [px, py, w] = spine[idx];
      const [qx, qy] = spine[Math.max(0, idx - 1)];
      const dir = Math.atan2(py - qy, px - qx);
      const side = rng.chance(0.5) ? 1 : -1;
      const childAngle = f === 1 ? dir + side * spread * rng.range(0.3, 0.7) : dir + side * spread * rng.range(0.8, 1.4);
      const childLen = length * (f === 1 ? rng.range(0.62, 0.78) : rng.range(0.4, 0.62));
      branch(px, py, childAngle, childLen, w * rng.range(0.6, 0.85), level - 1);
      if (f === 1) branch(px, py, dir - side * spread * rng.range(0.25, 0.55), length * rng.range(0.55, 0.72), w * rng.range(0.55, 0.75), level - 1);
    });
  }

  // raíces: ensanchamiento en la base
  const rw = o.width * 1.9;
  parts.push(polygon([[o.x - rw, o.baseY + 30], [o.x - o.width * 0.55, o.baseY - o.width * 1.4], [o.x + o.width * 0.55, o.baseY - o.width * 1.4], [o.x + rw, o.baseY + 30]]));
  branch(o.x, o.baseY, o.angle, o.length, o.width, o.levels);
  return parts.join("");
}
