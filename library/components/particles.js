// Partículas HTML (luciérnagas, motas de polvo) posicionadas con perspectiva; el movimiento lo aporta vf-motion.
import { n } from "../../src/rendering/svg.js";

/**
 * Coloca `count` partículas en una zona. sizeAt(y) devuelve el factor de escala por perspectiva.
 * Cada partícula lleva data-depth-scale para que el patrón "wander" escale su recorrido.
 */
export function particleField(rng, { count, area, className, idPrefix, size, sizeAt = () => 1, avoid = null }) {
  let out = "";
  let i = 0;
  let guard = 0;
  while (i < count && guard++ < count * 30) {
    const x = rng.range(area.x, area.x + area.w);
    const y = rng.range(area.y, area.y + area.h);
    if (avoid && avoid(x, y)) continue;
    const k = sizeAt(y);
    const s = rng.range(size[0], size[1]) * k;
    out += `<div class="${className}" id="${idPrefix}-${i}" data-depth-scale="${n(k, 2)}" style="left:${n(x - s / 2)}px;top:${n(y - s / 2)}px;width:${n(s)}px;height:${n(s)}px"></div>`;
    i++;
  }
  return out;
}

/** Par de ojos brillantes en la oscuridad (SVG), para una aparición puntual. */
export function watcherEyes({ id, x, y, spacing, size, color }) {
  const eye = (ex) =>
    `<ellipse cx="${n(ex)}" cy="${n(y)}" rx="${n(size * 2.6)}" ry="${n(size * 2)}" fill="${color}" opacity="0.18"/>` +
    `<ellipse cx="${n(ex)}" cy="${n(y)}" rx="${n(size)}" ry="${n(size * 0.62)}" fill="${color}"/>`;
  return `<g id="${id}"><g id="${id}-lids">${eye(x - spacing / 2)}${eye(x + spacing / 2)}</g></g>`;
}
