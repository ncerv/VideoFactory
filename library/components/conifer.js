// Siluetas de coníferas generadas proceduralmente (abetos estilizados).
import { polygon } from "../../src/rendering/svg.js";

/**
 * Silueta de una conífera como unión de pisos de ramas: cada piso es un polígono simple
 * (copa triangular con puntas caídas y borde inferior dentado) que se solapa con el siguiente.
 * Al no haber autointersecciones, el relleno nunca abre huecos.
 * @returns {string} subtrayectorias "d"
 */
export function coniferPath(rng, { x, baseY, height, width, trunk = 0.035 }) {
  const parts = [];
  const trunkH = height * rng.range(0.07, 0.11);
  const tw = Math.max(1.2, width * trunk);
  const crownBase = baseY - trunkH;
  const top = baseY - height;
  const tiers = Math.max(5, Math.round(height / (width * rng.range(0.32, 0.42))));
  const lean = rng.range(-0.04, 0.04) * width;
  parts.push(polygon([[x - tw, baseY + 2], [x - tw * 0.7, top + height * 0.3], [x + tw * 0.7, top + height * 0.3], [x + tw, baseY + 2]]));
  for (let i = 0; i < tiers; i++) {
    const f = i / tiers;
    const spacing = (crownBase - top) / tiers;
    const y = crownBase - (crownBase - top) * Math.pow(f, 0.92);
    const cx = x + lean * f;
    const half = (width / 2) * Math.pow(1 - f, 0.85) * rng.range(0.8, 1.12);
    const droopL = spacing * rng.range(0.25, 0.6);
    const droopR = spacing * rng.range(0.25, 0.6);
    const tierTop = i === tiers - 1 ? top : y - spacing * rng.range(1.5, 1.9);
    const pts = [[cx + rng.range(-0.03, 0.03) * width, tierTop], [cx + half, y + droopR]];
    // borde inferior dentado (agujas), de derecha a izquierda
    const jags = half > width * 0.15 ? 4 : 2;
    for (let j = 1; j <= jags; j++) {
      const t = j / (jags + 1);
      const jx = cx + half - 2 * half * t;
      const sag = Math.sin(t * Math.PI) * spacing * 0.35;
      pts.push([jx, y + (droopR + (droopL - droopR) * t) - sag + (j % 2 ? spacing * 0.18 : -spacing * 0.05)]);
    }
    pts.push([cx - half, y + droopL]);
    parts.push(polygon(pts));
  }
  return parts.join("");
}

/**
 * Hilera de coníferas sobre una línea de base, con un plano de suelo opaco debajo.
 * gap: [xa, xb] zona sin árboles (claro del sendero), opcional.
 */
export function treeLine(rng, { count, x0, x1, baseY, height, widthRatio, baseJitter = 0, gap = null, groundTo = null }) {
  const paths = [];
  const span = x1 - x0;
  for (let i = 0; i < count; i++) {
    const x = x0 + (span * (i + rng.range(0.1, 0.9))) / count;
    if (gap && x > gap[0] && x < gap[1]) continue;
    const h = rng.range(height[0], height[1]);
    const w = h * rng.range(widthRatio[0], widthRatio[1]);
    paths.push(coniferPath(rng, { x, baseY: baseY + rng.range(-baseJitter, baseJitter), height: h, width: w }));
  }
  if (groundTo !== null) paths.push(polygon([[x0, baseY - 1], [x1, baseY - 1], [x1, groundTo], [x0, groundTo]]));
  return paths.join("");
}
