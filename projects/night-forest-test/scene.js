// Escena de prueba "bosque nocturno" — composición de capas 2D en profundidad.
//
// Esta función solo describe la escena: capas (de fondo a primer plano), materiales y movimiento.
// La geometría la generan los componentes de library/components con semillas fijas,
// las texturas las pinta library/materials/vf-textures.js y el movimiento lo aplica
// library/motion/vf-motion.js a partir de los tiempos de timing.json.
//
// Profundidad (depth): 0 = cielo lejano, 1 = primer plano. La cámara escala y desplaza
// cada capa en proporción a su profundidad alrededor del punto de fuga del sendero.

import {
  bareTreePath,
  fernClump,
  grassBand,
  lightShafts,
  moon,
  particleField,
  starField,
  textureCanvas,
  trail,
  treeLine,
  watcherEyes,
} from "../../library/components/index.js";
import { gradient, smoothPath } from "../../src/rendering/svg.js";

// Paleta: noche fría de bruma verde azulada y un único acento cálido (luciérnagas y ojos).
const PALETTE = {
  skyTop: "#050b11",
  skyHigh: "#0a1a23",
  skyMid: "#15303a",
  horizon: "#2d4c52",
  moonHalo: "#bcd6cf",
  mist: "#a9c6c3",
  ridge: "#29464d",
  farTrees: "#18313a",
  midFarTrees: "#10232a",
  midTrees: "#0a181d",
  nearTrees: "#050c10",
  foreground: "#020608",
  groundFar: "#22393d",
  groundNear: "#060f12",
  accent: "#ffc56b",
};

const VANISH = [548, 1140]; // punto de fuga del sendero

export default function nightForest({ width: W, height: H, timing, rng }) {
  const T = timing;
  const id = "night-forest";
  const svg = (inner, a = "") => `<svg viewBox="0 0 ${W} ${H}" ${a}>${inner}</svg>`;
  let defs = "";
  const layers = [];

  // 1. Cielo: degradado + resplandor lunar + velo de nubes, pintado en Canvas con dithering.
  layers.push({
    id: "nf-sky",
    depth: 0.02,
    html: textureCanvas(
      "sky",
      {
        seed: 7,
        stops: [[0, PALETTE.skyTop], [0.26, PALETTE.skyHigh], [0.5, PALETTE.skyMid], [0.6, PALETTE.horizon], [1, "#0d1c20"]],
        glows: [
          { x: 0.66, y: 0.25, r: 0.62, color: "#6f9a9b", alpha: 0.42, falloff: 2.3 },
          { x: 0.66, y: 0.25, r: 0.2, color: "#d4e6dc", alpha: 0.38, falloff: 2.0 },
          { x: 0.5, y: 0.6, r: 0.75, squash: 0.3, color: "#5d817d", alpha: 0.4, falloff: 1.6 },
        ],
        clouds: { seed: 11, from: 0.08, to: 0.46, scaleX: 2.6, scaleY: 10, threshold: 0.02, alpha: 0.22, color: "#7d9c9c" },
      },
      { id: "nf-sky-canvas", width: W, height: H, class: "nf-full" },
    ),
  });

  // 2. Estrellas en tres grupos que centellean desfasados.
  const moonPos = { cx: 712, cy: 470, r: 92 };
  layers.push({
    id: "nf-stars",
    depth: 0.03,
    html: svg(starField(rng.fork(1), { count: 150, area: { x: 0, y: 0, w: W, h: 980 }, avoid: { x: moonPos.cx, y: moonPos.cy, r: 260 }, groups: 3, className: "nf-star", color: "#e6f0ea" })),
  });

  // 3. Luna: halo (respira y se atenúa con la nube) + disco texturizado.
  const m = moon({ id: "nf-moon", ...moonPos, seed: 5, colors: { core: "#f7f1dd", mid: "#e4dcc2", limb: "#b9b49e", halo: PALETTE.moonHalo, shadow: "#3a4a4c" } });
  defs += m.defs;
  layers.push({
    id: "nf-moon",
    depth: 0.06,
    html: svg(`<g id="nf-halo-dim"><g id="nf-halo-breath">${m.halo}</g></g>${m.disc}`),
  });

  // 4. Nube fina que cruza la luna (niebla estirada pintada en Canvas).
  layers.push({
    id: "nf-cloud",
    depth: 0.05,
    html: textureCanvas(
      "fog",
      { seed: 31, color: "#1d343b", alpha: 0.85, scaleX: 3.2, scaleY: 2.2, threshold: -0.05, softness: 0.45, center: 0.5, spread: 0.28, octaves: 5 },
      { id: "nf-cloud-canvas", width: 700, height: 160, class: "nf-cloud" },
    ),
  });

  defs += gradient("linear", "nf-ground-mist", [[0, PALETTE.mist, 0], [0.45, PALETTE.mist, 0.32], [1, PALETTE.mist, 0]], { x1: 0, y1: 0, x2: 0, y2: 1 });
  const mistBand = (y, h) => `<rect x="-200" y="${y}" width="${W + 400}" height="${h}" fill="url(#nf-ground-mist)"/>`;

  // 5. Cresta lejana: coníferas diminutas muy veladas por la bruma.
  layers.push({
    id: "nf-ridge",
    depth: 0.12,
    html: svg(`<path d="${treeLine(rng.fork(2), { count: 70, x0: -120, x1: W + 120, baseY: 1138, height: [36, 96], widthRatio: [0.32, 0.45], baseJitter: 10, groundTo: 1300 })}" fill="${PALETTE.ridge}"/>`),
  });

  // 6. Banco de niebla lejano.
  layers.push({
    id: "nf-fog-far",
    depth: 0.16,
    html: textureCanvas(
      "fog",
      { seed: 41, color: PALETTE.mist, alpha: 0.62, scaleX: 5, scaleY: 2.2, threshold: -0.25, softness: 0.55, center: 0.55, spread: 0.32 },
      { id: "nf-fog-far-canvas", width: 1080, height: 220, class: "nf-fog", style: "top:960px;height:400px" },
    ),
  });

  // 7. Bosque lejano.
  layers.push({
    id: "nf-far",
    depth: 0.25,
    html: svg(`<path d="${treeLine(rng.fork(3), { count: 38, x0: -140, x1: W + 140, baseY: 1162, height: [150, 320], widthRatio: [0.28, 0.4], baseJitter: 14, groundTo: 1320 })}" fill="${PALETTE.farTrees}"/>${mistBand(1100, 140)}`),
  });

  // 8. Bosque intermedio, con claro sobre el sendero.
  layers.push({
    id: "nf-midfar",
    depth: 0.36,
    html: svg(`<path d="${treeLine(rng.fork(4), { count: 18, x0: -160, x1: W + 160, baseY: 1196, height: [330, 640], widthRatio: [0.26, 0.36], baseJitter: 16, gap: [420, 690], groundTo: 1340 })}" fill="${PALETTE.midFarTrees}"/>`),
  });

  // 9. Suelo y sendero que se pierde en el punto de fuga.
  const path = trail(rng.fork(5), {
    id: "nf-trail",
    vanish: VANISH,
    bottomY: 1990,
    bottomCenter: 520,
    bottomHalf: 330,
    sway: 64,
    stones: 46,
    tufts: 70,
    colors: { far: "#9bb7b1", mid: "#34494b", near: "#0c1619", lit: "#c9dcd0", stone: "#1a2a2d", stoneLit: "#4d6664", edge: "#07100e" },
  });
  defs += path.defs;
  defs += gradient("linear", "nf-ground", [[0, PALETTE.farTrees], [0.12, PALETTE.midFarTrees], [0.4, "#0d1d22"], [1, PALETTE.groundNear]], { x1: 0, y1: 1190, x2: 0, y2: H, gradientUnits: "userSpaceOnUse" });
  const groundRng = rng.fork(11);
  const groundTop = [];
  for (let gx = -200; gx <= W + 200; gx += 60) groundTop.push([gx, 1194 + groundRng.range(-5, 5)]);
  layers.push({
    id: "nf-ground",
    depth: 0.55,
    html: svg(
      `<path d="${smoothPath([...groundTop, [W + 200, H + 200], [-200, H + 200]], { closed: true, tension: 0.3 })}" fill="url(#nf-ground)"/>` +
        mistBand(1120, 170) +
        path.body,
    ),
  });

  // 10. Haces de luna entre los árboles (degradados con máscara; sin filtros de desenfoque).
  const shafts = lightShafts({
    id: "nf-shaft",
    origin: [1010, -160],
    color: "#d6e9e0",
    beams: [
      { to: [330, 1600], width0: 30, width1: 190, opacity: 0.24 },
      { to: [590, 1540], width0: 20, width1: 130, opacity: 0.17 },
      { to: [130, 1280], width0: 16, width1: 100, opacity: 0.13 },
      { to: [780, 1680], width0: 12, width1: 80, opacity: 0.11 },
    ],
  });
  defs += shafts.defs;
  layers.push({ id: "nf-shafts", depth: 0.58, html: svg(`<g id="nf-shafts-dim"><g id="nf-shafts-breath">${shafts.body}</g></g>`, 'class="nf-screen"') });

  // 11. Motas de polvo dentro de los haces de luz.
  layers.push({
    id: "nf-motes",
    depth: 0.6,
    html: particleField(rng.fork(10), {
      count: 26,
      area: { x: 220, y: 380, w: 680, h: 1050 },
      className: "nf-mote",
      idPrefix: "nf-mote",
      size: [3, 6],
      sizeAt: (y) => 0.7 + ((y - 380) / 1050) * 0.6,
      avoid: (x, y) => x < 900 - (y - 380) * 0.55 - 160 || x > 900 - (y - 380) * 0.45 + 120, // dentro del haz principal
    }),
  });

  // 12. Árboles medianos a ambos lados + ojos que observan desde la oscuridad.
  const midRng = rng.fork(6);
  const midTrees =
    treeLine(midRng, { count: 5, x0: -170, x1: 400, baseY: 1300, height: [760, 1080], widthRatio: [0.22, 0.3], baseJitter: 30 }) +
    treeLine(midRng, { count: 5, x0: 700, x1: W + 170, baseY: 1310, height: [760, 1100], widthRatio: [0.22, 0.3], baseJitter: 30 });
  layers.push({
    id: "nf-mid",
    depth: 0.62,
    html: svg(`<path d="${midTrees}" fill="${PALETTE.midTrees}"/>${watcherEyes({ id: "nf-eyes", x: 282, y: 1196, spacing: 22, size: 4.2, color: PALETTE.accent })}`),
  });

  // 13. Niebla intermedia sobre el suelo.
  layers.push({
    id: "nf-fog-mid",
    depth: 0.68,
    html: textureCanvas(
      "fog",
      { seed: 53, color: PALETTE.mist, alpha: 0.5, scaleX: 4, scaleY: 2.4, threshold: -0.2, softness: 0.6, center: 0.5, spread: 0.3 },
      { id: "nf-fog-mid-canvas", width: 1080, height: 240, class: "nf-fog", style: "top:1150px;height:440px" },
    ),
  });

  // 14. Luciérnagas: el único acento cálido; su recorrido se escala con la perspectiva.
  layers.push({
    id: "nf-fireflies",
    depth: 0.72,
    html: particleField(rng.fork(7), {
      count: 15,
      area: { x: 90, y: 1170, w: 900, h: 560 },
      className: "nf-ff",
      idPrefix: "nf-ff",
      size: [22, 34],
      sizeAt: (y) => 0.45 + ((y - 1170) / 560) * 0.85,
      avoid: (x, y) => x > 230 && x < 360 && y < 1280, // no tapar los ojos
    }),
  });

  // 15. Árboles retorcidos de primer plano que enmarcan el encuadre.
  const nearRng = rng.fork(8);
  const nearTrees =
    bareTreePath(nearRng, { x: 20, baseY: 1990, angle: -1.52, length: 860, width: 104, levels: 6, spread: 0.5, curl: 0.13, upPull: 0.05, taper: 0.5, bounds: { maxX: 340, minY: -40 } }) +
    bareTreePath(nearRng, { x: 1075, baseY: 2000, angle: -1.62, length: 880, width: 108, levels: 6, spread: 0.5, curl: 0.13, upPull: 0.05, taper: 0.5, bounds: { minX: 850, minY: -40 } });
  layers.push({ id: "nf-near", depth: 0.86, html: svg(`<path d="${nearTrees}" fill="${PALETTE.nearTrees}"/>`) });

  // 16. Niebla rasante cercana.
  layers.push({
    id: "nf-fog-near",
    depth: 0.9,
    html: textureCanvas(
      "fog",
      { seed: 67, color: "#b7d0cc", alpha: 0.27, scaleX: 3.2, scaleY: 2.2, threshold: -0.15, softness: 0.65, center: 0.55, spread: 0.3 },
      { id: "nf-fog-near-canvas", width: 1080, height: 260, class: "nf-fog", style: "top:1460px;height:560px" },
    ),
  });

  // 17. Primer plano: hierba y helechos en silueta (los helechos se balancean).
  const fgRng = rng.fork(9);
  const grass = grassBand(fgRng, { x0: -60, x1: W + 60, baseY: 1940, height: [60, 230], density: 0.26, lowZone: [300, 760], lowFactor: 0.3 });
  const ferns =
    fernClump(fgRng, { x: 60, y: 1960, count: 7, length: 520, spreadAngle: 1.6, baseAngle: -1.2, fill: PALETTE.foreground, idPrefix: "nf-fern-l", className: "nf-fern" }) +
    fernClump(fgRng, { x: 1020, y: 1965, count: 7, length: 560, spreadAngle: 1.6, baseAngle: -1.94, fill: PALETTE.foreground, idPrefix: "nf-fern-r", className: "nf-fern" });
  layers.push({ id: "nf-foreground", depth: 1, html: svg(`<path d="${grass}" fill="${PALETTE.foreground}"/>${ferns}`) });

  // 18-19. Viñeta y grano (espacio de pantalla, sin cámara).
  layers.push({ id: "nf-vignette", depth: null, html: "" });
  layers.push({
    id: "nf-grain",
    depth: null,
    html: textureCanvas("grain", { seed: 99, amount: T.grain.amount }, { id: "nf-grain-canvas", width: W + 100, height: H + 100 }),
  });

  // ---------------------------------------------------------------- movimiento
  const d = T.duration;
  const dim = T.light.dim;
  const dimKeys = (sel) => ({
    type: "sequence",
    sel,
    keys: [
      { at: dim.start, from: { opacity: 1 }, to: { opacity: dim.level }, duration: dim.full - dim.start, ease: "sine.inOut" },
      { at: dim.full + dim.hold, from: { opacity: dim.level }, to: { opacity: 1 }, duration: dim.release, ease: "sine.inOut" },
    ],
  });
  const eyes = T.eyes;
  const blink = (at, i) => [
    { at, from: { scaleY: 1 }, to: { scaleY: 0.08 }, duration: 0.07, ease: "power2.in" },
    { at: at + 0.07, from: { scaleY: 0.08 }, to: { scaleY: 1 }, duration: 0.11, ease: "power2.out" },
  ];

  const motion = [
    { type: "camera", origin: [VANISH[0] / W, VANISH[1] / H], ...T.camera },
    { type: "drift", sel: "#nf-cloud-canvas", x: T.cloud.dx, start: 0, duration: d },
    { type: "drift", sel: "#nf-fog-far-canvas", x: T.fog.far.dx, start: 0, duration: d },
    { type: "drift", sel: "#nf-fog-mid-canvas", x: T.fog.mid.dx, start: 0, duration: d },
    { type: "drift", sel: "#nf-fog-near-canvas", x: T.fog.near.dx, start: 0, duration: d },
    { type: "oscillate", sel: "#nf-halo-breath", prop: "opacity", from: 0.82, to: 1, cycle: T.light.haloCycle, start: 0, duration: d },
    { type: "oscillate", sel: "#nf-shafts-breath", prop: "opacity", from: 0.7, to: 1, cycle: T.light.shaftCycle, start: 0, duration: d, phase: "to" },
    dimKeys("#nf-halo-dim"),
    dimKeys("#nf-shafts-dim"),
    ...T.stars.cycles.map((cycle, k) => ({ type: "oscillate", sel: `#nf-star-${k}`, prop: "opacity", from: 1, to: 0.45, cycle, start: 0, duration: d, phase: k % 2 ? "to" : "from" })),
    { type: "wander", sel: ".nf-ff", seed: 21, radius: [70, 50], fall: [0, -26], hop: T.fireflies.hop, start: 0, duration: d, flicker: { range: [0.35, 1], hop: T.fireflies.flickerHop, darkChance: 0.16 } },
    { type: "wander", sel: ".nf-mote", seed: 37, radius: [26, 26], fall: [-50, 110], hop: T.motes.hop, start: 0, duration: d, flicker: { range: [0.15, 0.7], hop: [0.8, 1.8] } },
    { type: "sway", sel: ".nf-fern", seed: 13, amplitude: T.ferns.amplitude, cycle: T.ferns.cycle, start: 0, duration: d },
    {
      type: "sequence",
      sel: "#nf-eyes",
      keys: [
        { at: eyes.appear, from: { opacity: 0 }, to: { opacity: 1 }, duration: eyes.fadeIn, ease: "sine.out" },
        { at: eyes.vanish, from: { opacity: 1 }, to: { opacity: 0 }, duration: eyes.fadeOut, ease: "sine.in" },
      ],
    },
    { type: "sequence", sel: "#nf-eyes-lids", keys: eyes.blinks.flatMap(blink).map((k) => ({ ...k, from: { ...k.from, transformOrigin: "50% 50%" } })) },
    { type: "jitter", sel: "#nf-grain-canvas", fps: T.grain.fps, amount: 40, seed: 5, start: 0, duration: d },
  ];

  const css = `
    #root .nf-full { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; }
    #root .nf-fog { position: absolute; left: -540px; width: 2160px; }
    #root .nf-cloud { position: absolute; left: 380px; top: 360px; width: 1400px; height: 300px; }
    #root .nf-screen { mix-blend-mode: screen; }
    #root .nf-ff {
      position: absolute;
      border-radius: 50%;
      background: radial-gradient(circle, #fff6d6 0%, ${PALETTE.accent} 14%, rgba(255, 176, 72, 0.42) 32%, rgba(255, 160, 60, 0.12) 52%, rgba(255, 150, 50, 0) 72%);
    }
    #root .nf-mote {
      position: absolute;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(232, 244, 236, 0.95) 0%, rgba(214, 233, 224, 0.4) 45%, rgba(214, 233, 224, 0) 75%);
    }
    #root #nf-vignette {
      background:
        radial-gradient(ellipse 78% 62% at 50% 56%, rgba(2, 6, 8, 0) 52%, rgba(2, 6, 8, 0.42) 82%, rgba(2, 6, 8, 0.72) 100%);
    }
    #root #nf-grain { overflow: hidden; mix-blend-mode: overlay; opacity: 0.1; }
    #root #nf-grain-canvas { position: absolute; left: -50px; top: -50px; width: ${W + 100}px; height: ${H + 100}px; }
`;

  return { id, background: PALETTE.skyTop, css, defs, layers, motion };
}
