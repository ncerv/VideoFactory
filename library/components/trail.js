// Sendero en perspectiva que se pierde hacia un punto de fuga, con piedras y matas en los bordes.
import { gradient, n, polygon, smoothPath } from "../../src/rendering/svg.js";

/**
 * @param o { id, vanish:[x,y], bottomY, bottomCenter, bottomHalf, sway, colors:{far, near, lit, stone, edge}, stones, tufts }
 * @returns {{defs: string, body: string}}
 */
export function trail(rng, o) {
  const [vx, vy] = o.vanish;
  const samples = 28;
  const persp = (u) => Math.pow(1 - u, 1.7); // 1 cerca, 0 en el punto de fuga
  const at = (u) => {
    const p = persp(u);
    const y = vy + (o.bottomY - vy) * p;
    const cx = vx + (o.bottomCenter - vx) * p + o.sway * Math.sin(u * Math.PI * 1.15) * p * 1.6;
    return { y, cx, half: 2 + o.bottomHalf * p };
  };
  const edge = (dir, widthFactor, roughness) => {
    const pts = [];
    for (let i = 0; i <= samples; i++) {
      const u = i / samples;
      const { y, cx, half } = at(u);
      pts.push([cx + dir * half * widthFactor * (1 + rng.range(-roughness, roughness)), y]);
    }
    return pts;
  };
  const shape = (widthFactor, roughness) => {
    const left = edge(-1, widthFactor, roughness);
    const right = edge(1, widthFactor, roughness).reverse();
    return smoothPath([...left, ...right], { closed: true, tension: 0.35 });
  };

  const id = o.id;
  let defs = [
    gradient("linear", `${id}-fill`, [[0, o.colors.far, 1], [0.45, o.colors.mid], [1, o.colors.near]], { x1: 0, y1: vy, x2: 0, y2: o.bottomY, gradientUnits: "userSpaceOnUse" }),
    gradient("linear", `${id}-lit`, [[0, o.colors.lit, 0.0], [0.2, o.colors.lit, 0.42], [0.6, o.colors.lit, 0.1], [1, o.colors.lit, 0]], { x1: 0, y1: vy, x2: 0, y2: o.bottomY, gradientUnits: "userSpaceOnUse" }),
  ].join("");

  const outline = shape(1, 0.06);
  defs += `<clipPath id="${id}-clip"><path d="${outline}"/></clipPath>`;
  let body = `<path d="${outline}" fill="url(#${id}-fill)"/>`;
  // sombra interior en los bordes: el mismo contorno trazado en oscuro y recortado al sendero
  const shade = o.edgeShade ?? 34;
  body += `<g clip-path="url(#${id}-clip)" fill="none" stroke="${o.colors.near}"><path d="${outline}" stroke-width="${shade}" stroke-opacity="0.22"/><path d="${outline}" stroke-width="${shade * 0.45}" stroke-opacity="0.3"/></g>`;
  body += `<path d="${shape(0.42, 0.12)}" fill="url(#${id}-lit)"/>`;

  // Piedras: más grandes y frecuentes cerca de la cámara.
  let stones = "";
  for (let i = 0; i < o.stones; i++) {
    const u = Math.pow(rng(), 0.6) * 0.92;
    const { y, cx, half } = at(u);
    const p = persp(u);
    const x = cx + rng.range(-0.85, 0.85) * half;
    const rx = (2 + 14 * p) * rng.range(0.5, 1.3);
    stones += `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(rx)}" ry="${n(rx * rng.range(0.35, 0.55))}" fill="${rng.chance(0.65) ? o.colors.stone : o.colors.stoneLit}" opacity="${n(rng.range(0.45, 0.9), 2)}"/>`;
  }
  body += stones;

  // Matas de hierba en los bordes.
  let tufts = "";
  for (let i = 0; i < o.tufts; i++) {
    const u = Math.pow(rng(), 0.8) * 0.9;
    const { y, cx, half } = at(u);
    const p = persp(u);
    const dir = rng.chance(0.5) ? -1 : 1;
    const x = cx + dir * half * rng.range(0.85, 1.15);
    const h = (3 + 46 * p) * rng.range(0.6, 1.2);
    const blades = rng.int(3, 5);
    const pts = [];
    for (let b = 0; b < blades; b++) {
      const bx = x + (b - blades / 2) * h * 0.12;
      const lean = rng.range(-0.5, 0.5) * h;
      pts.push(polygon([[bx - h * 0.05, y + 1], [bx + lean, y - h * rng.range(0.6, 1)], [bx + h * 0.05, y + 1]]));
    }
    tufts += pts.join("");
  }
  body += `<path d="${tufts}" fill="${o.colors.edge}"/>`;
  return { defs, body };
}
