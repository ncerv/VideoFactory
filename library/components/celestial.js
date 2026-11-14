// Luna con superficie texturizada y halo, y campo de estrellas en grupos para el centelleo.
import { gradient, n } from "../../src/rendering/svg.js";

/**
 * Luna: disco con oscurecimiento del limbo, mares generados con feTurbulence (recortados al disco)
 * y un halo radial. Devuelve el halo y el disco por separado para animar la luz de forma independiente.
 */
export function moon({ id, cx, cy, r, colors, seed = 3 }) {
  const defs = [
    gradient("radial", `${id}-disc`, [[0, colors.core], [0.72, colors.mid], [1, colors.limb]], { cx: "40%", cy: "38%", r: "68%" }),
    gradient("radial", `${id}-halo`, [[0, colors.halo, 0.55], [0.18, colors.halo, 0.32], [0.45, colors.halo, 0.1], [1, colors.halo, 0]]),
    `<filter id="${id}-maria" x="0" y="0" width="100%" height="100%">` +
      `<feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="4" seed="${seed}" result="noise"/>` +
      `<feColorMatrix in="noise" type="matrix" values="0 0 0 0 0.42  0 0 0 0 0.44  0 0 0 0 0.42  0 0 0 2.6 -1.15"/>` +
      `<feGaussianBlur stdDeviation="1.4"/>` +
      `</filter>`,
    `<filter id="${id}-pores" x="0" y="0" width="100%" height="100%">` +
      `<feTurbulence type="turbulence" baseFrequency="0.09" numOctaves="2" seed="${seed + 7}"/>` +
      `<feColorMatrix type="matrix" values="0 0 0 0 0.3  0 0 0 0 0.3  0 0 0 0 0.3  0 0 0 1.4 -0.85"/>` +
      `</filter>`,
    `<clipPath id="${id}-clip"><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}"/></clipPath>`,
  ].join("");
  const halo = `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r * 4.2)}" fill="url(#${id}-halo)"/>`;
  const disc =
    `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="url(#${id}-disc)"/>` +
    `<g clip-path="url(#${id}-clip)" opacity="0.55">` +
    `<rect x="${n(cx - r)}" y="${n(cy - r)}" width="${n(r * 2)}" height="${n(r * 2)}" filter="url(#${id}-maria)"/>` +
    `<rect x="${n(cx - r)}" y="${n(cy - r)}" width="${n(r * 2)}" height="${n(r * 2)}" filter="url(#${id}-pores)" opacity="0.5"/>` +
    `</g>`;
  return { defs, halo, disc };
}

/** Estrellas repartidas en `groups` grupos (<g class="{className}-k">) para centellear con desfase. */
export function starField(rng, { count, area, avoid = null, groups = 3, className, color }) {
  const buckets = Array.from({ length: groups }, () => []);
  let placed = 0;
  let guard = 0;
  while (placed < count && guard++ < count * 20) {
    const x = rng.range(area.x, area.x + area.w);
    // más estrellas arriba, menos cerca del horizonte
    const y = area.y + area.h * Math.pow(rng(), 1.6);
    if (avoid && Math.hypot(x - avoid.x, y - avoid.y) < avoid.r) continue;
    const big = rng.chance(0.08);
    const r = big ? rng.range(1.8, 2.6) : rng.range(0.7, 1.5);
    const o = big ? rng.range(0.75, 1) : rng.range(0.25, 0.75);
    buckets[placed % groups].push(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(r, 2)}" opacity="${n(o, 2)}"/>`);
    placed++;
  }
  return buckets.map((b, k) => `<g class="${className}-${k}" id="${className}-${k}" fill="${color}">${b.join("")}</g>`).join("");
}
