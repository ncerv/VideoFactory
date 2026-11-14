// Vegetación de primer plano: franjas de hierba y frondas de helecho en silueta.
import { n, polygon, smoothPath } from "../../src/rendering/svg.js";

/** Franja de briznas de hierba a lo largo de una línea, más baja en una zona (p. ej. el sendero). */
export function grassBand(rng, { x0, x1, baseY, height, density, lowZone = null, lowFactor = 0.35 }) {
  const parts = [];
  const count = Math.round((x1 - x0) * density);
  for (let i = 0; i < count; i++) {
    const x = rng.range(x0, x1);
    let h = rng.range(height[0], height[1]);
    if (lowZone && x > lowZone[0] && x < lowZone[1]) h *= lowFactor;
    const w = rng.range(3, 7);
    const lean = rng.range(-0.45, 0.45) * h;
    const mid = [x + lean * 0.35, baseY - h * 0.55];
    parts.push(smoothPath([[x - w, baseY + 6], mid, [x + lean, baseY - h], [x + w * 0.4 + lean * 0.3, baseY - h * 0.5], [x + w, baseY + 6]], { closed: true, tension: 0.3 }));
  }
  return parts.join("");
}

/**
 * Fronda de helecho: raquis curvado con foliolos que decrecen hacia la punta.
 * Se dibuja en coordenadas absolutas con la base en (ox, oy); el balanceo usa svgOrigin en ese punto.
 */
export function fernFrond(rng, { length, angle, curl = 0.35, leaflets = 16, leafLen = 0.22, ox = 0, oy = 0 }) {
  const parts = [];
  const steps = leaflets;
  let x = ox;
  let y = oy;
  let a = angle;
  const spine = [[ox, oy]];
  for (let i = 1; i <= steps; i++) {
    a += curl / steps;
    x += Math.cos(a) * (length / steps);
    y += Math.sin(a) * (length / steps);
    spine.push([x, y]);
  }
  // raquis
  const thick = length * 0.012;
  const left = spine.map(([px, py], i) => [px - Math.sin(a) * thick * (1 - i / steps), py + thick * (1 - i / steps)]);
  parts.push(polygon([...spine, ...left.reverse()]));
  // foliolos
  for (let i = 1; i < steps; i++) {
    const [px, py] = spine[i];
    const [qx, qy] = spine[i + 1];
    const dir = Math.atan2(qy - py, qx - px);
    const f = 1 - i / steps;
    const len = length * leafLen * Math.pow(f, 0.6) * rng.range(0.85, 1.1);
    for (const side of [-1, 1]) {
      const la = dir + side * rng.range(1.0, 1.3);
      const tip = [px + Math.cos(la) * len, py + Math.sin(la) * len + len * 0.25];
      const w = len * 0.22;
      parts.push(polygon([[px, py], [px + Math.cos(dir) * w + Math.cos(la) * len * 0.5, py + Math.sin(dir) * w + Math.sin(la) * len * 0.5], tip, [px + Math.cos(la) * len * 0.45, py + Math.sin(la) * len * 0.45 + w * 0.3]]));
    }
  }
  return parts.join("");
}

/** Grupo de frondas con origen común (macizo de helechos). Devuelve marcado SVG <g>. */
export function fernClump(rng, { x, y, count, length, spreadAngle, baseAngle, fill, idPrefix, className }) {
  let out = "";
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const angle = baseAngle + (t - 0.5) * spreadAngle + rng.range(-0.08, 0.08);
    const len = length * rng.range(0.7, 1.05);
    const d = fernFrond(rng, { length: len, angle, curl: (t - 0.5) * 0.9 + rng.range(-0.1, 0.1), ox: x, oy: y });
    out += `<g class="${className}" id="${idPrefix}-${i}" data-svg-origin="${n(x)} ${n(y)}"><path d="${d}" fill="${fill}"/></g>`;
  }
  return out;
}
