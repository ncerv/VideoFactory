// El Curupira (Brasil, Amazonía) — escena 2D en estilo Sumi Ink sobre la narración real (55,32 s).
//
// Ocho planos (las ocho escenas del guion aprobado) apilados en una sola composición. Cada plano
// entra y sale con un fundido corto centrado en una pausa real de la voz (timing.json → cuts), y
// tiene su propio empuje de cámara y sus acontecimientos internos (timing.json → s1..s8).
// Tinta negra y aguadas grises sobre papel; un único color: el rojo del pelo del Curupira.
//
// Reutiliza library/components (fernClump, bareTreePath, grassBand, textureCanvas) y
// src/rendering/svg.js. Los dibujos propios de esta historia (huellas, canoa, pacas, figuras,
// trazo del silbido, río a la aguada) son locales de la escena.

import { bareTreePath, fernClump, grassBand, textureCanvas } from "../../library/components/index.js";
import { gradient, polygon, smoothPath } from "../../src/rendering/svg.js";

const INK = "#15130f";
const INK2 = "#2c2823";
const WASH = "#5d574d";
const PAPER = "#e6dcc6";
const RED = "#b0281c";
const n = (v) => Math.round(v * 10) / 10;

// ------------------------------------------------------------------ pinceles (locales)

/** Trazo de pincel: polígono alrededor de una línea, con ancho variable y borde irregular. */
function brush(rng, pts, w0, w1, jitter = 0.18) {
  const left = [];
  const right = [];
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = pts[i];
    const [ax, ay] = pts[Math.max(0, i - 1)];
    const [bx, by] = pts[Math.min(pts.length - 1, i + 1)];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const nx = -(by - ay) / len;
    const ny = (bx - ax) / len;
    const t = i / (pts.length - 1);
    const w = (w0 + (w1 - w0) * t) * (1 + rng.range(-jitter, jitter)) * Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.85)) ** 0.35;
    left.push([x + nx * w * 0.5, y + ny * w * 0.5]);
    right.push([x - nx * w * 0.5, y - ny * w * 0.5]);
  }
  return smoothPath([...left, ...right.reverse()], { closed: true, tension: 0.4 });
}

/** Mancha de aguada irregular. */
function blob(rng, cx, cy, rx, ry, k = 14, jit = 0.22) {
  const pts = [];
  for (let i = 0; i < k; i++) {
    const a = (i / k) * Math.PI * 2;
    const r = 1 + rng.range(-jit, jit);
    pts.push([cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r]);
  }
  return smoothPath(pts, { closed: true, tension: 0.5 });
}

/** Huella de pie descalzo. rot = dirección de los dedos (grados, 0 = hacia arriba). */
function footprint(x, y, s, rot, fill = INK, opacity = 0.85, cls = "") {
  return `<g ${cls ? `class="${cls}" ` : ""}transform="translate(${n(x)} ${n(y)}) rotate(${n(rot)}) scale(${n(s * 100) / 100})" fill="${fill}" opacity="${opacity}">
    <ellipse cx="0" cy="14" rx="12" ry="15"/><ellipse cx="1" cy="-6" rx="15" ry="16"/>
    <ellipse cx="-11" cy="-27" rx="4.6" ry="5.6"/><ellipse cx="-3" cy="-31" rx="4.2" ry="5.2"/><ellipse cx="4.5" cy="-31" rx="3.8" ry="4.8"/><ellipse cx="11" cy="-28" rx="3.4" ry="4.3"/><ellipse cx="16" cy="-22" rx="3" ry="3.8"/>
  </g>`;
}

/** Hilera de huellas en perspectiva desde (x0,y0) cerca hasta (x1,y1) lejos; dedos apuntando a (x1,y1). */
function printTrail(rng, { count, x0, y0, x1, y1, s0, s1, prefix, spread = 34 }) {
  let out = "";
  const ang = (Math.atan2(x1 - x0, -(y1 - y0)) * 180) / Math.PI;
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const s = s0 + (s1 - s0) * t;
    const side = i % 2 ? 1 : -1;
    const x = x0 + (x1 - x0) * t + side * spread * s + rng.range(-4, 4);
    const y = y0 + (y1 - y0) * t ** 0.85;
    out += `<g id="${prefix}-${i}" class="${prefix}">${footprint(x, y, s, ang + side * 6 + rng.range(-5, 5))}</g>`;
  }
  return out;
}

/** Río a la aguada: banda oscura con ondas de pincel. */
function river(rng, { y, h, idg }) {
  let ripples = "";
  for (let i = 0; i < 14; i++) {
    const yy = y + rng.range(0.1, 0.9) * h;
    const xx = rng.range(-80, 1000);
    const len = rng.range(120, 320);
    ripples += `<path d="${brush(rng, [[xx, yy], [xx + len * 0.5, yy - 3], [xx + len, yy + 1]], 3, 1.5)}" fill="${PAPER}" opacity="${n(rng.range(0.12, 0.3) * 100) / 100}"/>`;
  }
  const top = Array.from({ length: 13 }, (_, i) => [-80 + i * 103, y + rng.range(-14, 14)]);
  const bot = Array.from({ length: 13 }, (_, i) => [1160 - i * 103, y + h + rng.range(-18, 18)]);
  return `<path d="${smoothPath([...top, ...bot], { closed: true, tension: 0.35 })}" fill="url(#${idg})"/>${ripples}`;
}

/** Figura humana en tinta (Raimundo): de pie caminando o agachado. */
function person(rng, x, y, s, pose = "walk") {
  const k = (v) => v * s;
  const body = pose === "crouch"
    ? brush(rng, [[x, y - k(150)], [x + k(30), y - k(95)], [x + k(40), y - k(40)]], k(46), k(38), 0.08)
    : brush(rng, [[x, y - k(250)], [x + k(6), y - k(170)], [x + k(2), y - k(95)]], k(44), k(36), 0.08);
  const legs = pose === "crouch"
    ? brush(rng, [[x + k(40), y - k(40)], [x + k(10), y - k(20)], [x + k(30), y]], k(22), k(14)) + brush(rng, [[x + k(40), y - k(40)], [x + k(70), y - k(18)], [x + k(66), y]], k(20), k(12))
    : brush(rng, [[x, y - k(100)], [x - k(28), y - k(50)], [x - k(40), y]], k(24), k(14)) + brush(rng, [[x + k(4), y - k(100)], [x + k(30), y - k(48)], [x + k(28), y]], k(22), k(13));
  const arm = pose === "crouch"
    ? brush(rng, [[x + k(20), y - k(120)], [x + k(60), y - k(70)], [x + k(95), y - k(22)]], k(16), k(10))
    : brush(rng, [[x + k(4), y - k(225)], [x + k(40), y - k(175)], [x + k(52), y - k(120)]], k(16), k(10));
  const head = pose === "crouch" ? [x - k(4), y - k(178)] : [x - k(2), y - k(286)];
  const hat = `<path d="${blob(rng, head[0], head[1] - k(18), k(44), k(10), 10, 0.08)}"/>`;
  return `<g fill="${INK}"><circle cx="${n(head[0])}" cy="${n(head[1])}" r="${n(k(26))}"/>${hat}<path d="${body}"/><path d="${legs}"/><path d="${arm}"/></g>`;
}

/** Paca en tinta (cuerpo redondo, patas cortas). hanging: colgada boca abajo. */
function paca(rng, x, y, s, hanging = false) {
  const k = (v) => v * s;
  const b = blob(rng, x, y, k(46), k(28), 12, 0.1);
  const head = blob(rng, x + k(46), y - k(6), k(20), k(16), 10, 0.1);
  const legs = [-24, 22].map((dx) => `<path d="${brush(rng, [[x + k(dx), y + k(16)], [x + k(dx + 3), y + k(40)]], k(9), k(6))}"/>`).join("");
  const spots = Array.from({ length: 4 }, (_, i) => `<ellipse cx="${n(x - k(26) + i * k(17))}" cy="${n(y - k(2))}" rx="${n(k(4))}" ry="${n(k(3))}" fill="${PAPER}" opacity="0.5"/>`).join("");
  const g = `<g fill="${INK}"><path d="${b}"/><path d="${head}"/>${legs}${spots}</g>`;
  return hanging ? `<g transform="rotate(90 ${n(x)} ${n(y)})">${g}</g>` : g;
}

/** Canoa en tinta. */
function canoe(rng, x, y, w) {
  const d = smoothPath([[x - w / 2, y - 18], [x - w * 0.3, y + 14], [x + w * 0.3, y + 14], [x + w / 2, y - 22], [x + w * 0.42, y - 6], [x - w * 0.42, y - 4]], { closed: true, tension: 0.35 });
  return `<path d="${d}" fill="${INK}"/>`;
}

/** Selva en tinta: troncos, lianas y frondas. */
function jungle(rng, { prefix, trunks, ferns = [], dark = INK, wash = INK2, liana = 6 }) {
  let out = "";
  for (const t of trunks) out += `<path d="${bareTreePath(rng, { x: t.x, baseY: t.y ?? 2000, angle: t.a ?? -1.57, length: t.len ?? 1500, width: t.w ?? 60, levels: t.levels ?? 4, spread: 0.4, curl: 0.08, upPull: 0.1, taper: 0.55, bounds: { minY: -60 } })}" fill="${t.light ? wash : dark}" opacity="${t.op ?? 1}"/>`;
  for (let i = 0; i < liana; i++) {
    const x0 = rng.range(-40, 1120);
    const pts = Array.from({ length: 7 }, (_, j) => [x0 + Math.sin(j * 0.9 + i) * rng.range(20, 60), -40 + j * rng.range(140, 220)]);
    out += `<path d="${brush(rng, pts, 9, 4, 0.3)}" fill="${wash}" opacity="${n(rng.range(0.5, 0.9) * 100) / 100}"/>`;
  }
  ferns.forEach((f, i) => {
    out += fernClump(rng, { x: f.x, y: f.y, count: f.count ?? 6, length: f.len ?? 420, spreadAngle: f.spread ?? 1.5, baseAngle: f.angle ?? -1.57, fill: f.fill ?? dark, idPrefix: `${prefix}-fern-${i}`, className: `${prefix}-fern` });
  });
  return out;
}

/** Trazo del silbido: línea ondulada (polilínea con longitud exacta para dibujarla con dashoffset). */
function whistle(x0, y0, x1, amp, waves) {
  const pts = [];
  for (let i = 0; i <= 120; i++) {
    const t = i / 120;
    pts.push([x0 + (x1 - x0) * t, y0 + Math.sin(t * Math.PI * 2 * waves) * amp * Math.sin(Math.PI * t) - t * 60]);
  }
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return { d: "M" + pts.map((p) => `${n(p[0])} ${n(p[1])}`).join(" L"), len: Math.ceil(len) };
}

// ------------------------------------------------------------------ escena

export default function curupira({ width: W, height: H, timing: T, rng }) {
  const id = "curupira";
  const svg = (inner) => `<svg viewBox="0 0 ${W} ${H}">${inner}</svg>`;
  const cuts = [0, ...T.cuts, T.duration];
  const F = T.fade;
  let defs = "";
  defs += gradient("linear", "cu-river", [[0, "#1d1a16", 0.95], [0.5, "#34302a", 0.9], [1, "#4a443b", 0.85]], { x1: 0, y1: 0, x2: 0, y2: 1 });
  defs += gradient("linear", "cu-river-dawn", [[0, "#8d877b", 0.9], [1, "#b9b19f", 0.85]], { x1: 0, y1: 0, x2: 0, y2: 1 });
  defs += gradient("linear", "cu-mud", [[0, WASH, 0], [0.25, WASH, 0.35], [1, "#3a352e", 0.85]], { x1: 0, y1: 0, x2: 0, y2: 1 });
  defs += gradient("radial", "cu-spot", [[0, PAPER, 0.55], [0.6, PAPER, 0.18], [1, PAPER, 0]], {});
  defs += gradient("radial", "cu-dark", [[0, "#0d0c0a", 0], [0.6, "#0d0c0a", 0.25], [1, "#0d0c0a", 0.85]], {});

  const layers = [];
  const motion = [];

  // Papel de fondo (textura procedural) y aguada nocturna que cambia por plano.
  layers.push({
    id: "cu-paper",
    depth: null,
    html: textureCanvas("sky", { seed: 3, stops: [[0, "#ddd2ba"], [0.5, PAPER], [1, "#d6cab0"]], glows: [{ x: 0.5, y: 0.45, r: 0.7, color: "#f2ead8", alpha: 0.5, falloff: 1.8 }] }, { id: "cu-paper-canvas", width: W, height: H, class: "cu-full" }),
  });
  layers.push({ id: "cu-night", depth: null, html: `<div id="cu-night-wash" class="cu-full"></div>` });
  motion.push({
    type: "sequence",
    sel: "#cu-night-wash",
    keys: T.night.slice(1).map((lvl, i) => ({ at: cuts[i + 1] - F / 2, from: { opacity: T.night[i] }, to: { opacity: lvl }, duration: F, ease: "sine.inOut" })),
  });

  // Cada plano: capa con fundido de entrada/salida (#cu-sN) y empuje de cámara (#cu-sN-cam).
  const shot = (k, inner, origin = "50% 55%") => {
    layers.push({ id: `cu-s${k}`, depth: null, className: "cu-shot", html: `<div id="cu-s${k}-cam" class="cu-full">${svg(inner)}</div>` });
    const a = cuts[k - 1];
    const b = cuts[k];
    const keys = [];
    if (k > 1) keys.push({ at: a - F / 2, from: { opacity: 0 }, to: { opacity: 1 }, duration: F, ease: "sine.inOut" });
    if (k < 8) keys.push({ at: b - F / 2, from: { opacity: 1 }, to: { opacity: 0 }, duration: F, ease: "sine.inOut" });
    motion.push({ type: "sequence", sel: `#cu-s${k}`, keys });
    motion.push({ type: "sequence", sel: `#cu-s${k}-cam`, keys: [{ at: Math.max(0, a - F / 2), from: { scale: 1, transformOrigin: origin }, to: { scale: T.push[k - 1] }, duration: b - a + F, ease: "sine.inOut" }] });
  };

  // Plano de huellas hacia el río (escena 1 y, con la misma semilla, escena 8: bucle).
  const printsShot = (prefix, seed) => {
    const r = rng.fork(seed);
    const mud = `<rect x="-60" y="300" width="1200" height="1700" fill="url(#cu-mud)"/>`;
    const sideJungle = jungle(r, { prefix, trunks: [{ x: 40, w: 90, len: 1700 }, { x: 1040, w: 80, len: 1650 }, { x: 170, w: 34, len: 1200, light: true, op: 0.7 }, { x: 930, w: 30, len: 1100, light: true, op: 0.7 }], ferns: [{ x: 40, y: 1960, angle: -1.15, len: 560 }, { x: 1050, y: 1960, angle: -1.98, len: 560 }], liana: 4 });
    const prints = printTrail(r, { count: 11, x0: 540, y0: 1760, x1: 560, y1: 560, s0: 1.45, s1: 0.55, prefix: `${prefix}-p` });
    return { mud, sideJungle, prints, river: river(r, { y: 250, h: 230, idg: "cu-river" }) };
  };

  // 1 · Gancho: huellas en el lodo que llevan a un río que se aleja.
  const p1 = printsShot("cu1", 1);
  shot(1, `<g id="cu1-river">${p1.river}</g>${p1.mud}${p1.prints}${p1.sideJungle}`);
  motion.push({ type: "sequence", sel: ".cu1-p", keys: [{ at: T.s1.prints[0], from: { opacity: 0 }, to: { opacity: 1, stagger: { each: T.s1.prints[1] / 11 } }, duration: 0.35, ease: "sine.out" }] });
  motion.push({ type: "sequence", sel: "#cu1-river", keys: [{ at: T.s1.riverAway[0], from: { y: 0, opacity: 1 }, to: { y: -150, opacity: 0.55 }, duration: T.s1.riverAway[1], ease: "sine.inOut" }] });

  // 2 · Orilla del Amazonas al atardecer: canoa con tres pacas; Raimundo entra al monte.
  {
    const r = rng.fork(2);
    const water = river(r, { y: 980, h: 520, idg: "cu-river" });
    const bank = `<path d="${blob(r, 260, 1560, 700, 150, 16, 0.12)}" fill="${INK2}" opacity="0.92"/>`;
    const pole = `<path d="${brush(r, [[600, 1080], [760, 1040], [930, 1010]], 7, 5)}" fill="${INK}"/><path d="${brush(r, [[880, 1238], [884, 1130], [888, 1020]], 9, 7, 0.05)}" fill="${INK}"/>`;
    const hung = [650, 730, 810].map((x, i) => `<path d="${brush(r, [[x, 1060 - i * 10], [x, 1110 - i * 10]], 3, 2)}" fill="${INK}"/>${paca(r, x, 1160 - i * 10, 0.75, true)}`).join("");
    const boat = `<g id="cu2-boat">${canoe(r, 760, 1250, 520)}${pole}${hung}</g>`;
    const wood = jungle(r, { prefix: "cu2", trunks: [{ x: 60, w: 110, len: 1500, y: 1600 }, { x: 200, w: 60, len: 1300, y: 1560, light: true, op: 0.8 }, { x: 330, w: 40, len: 1100, y: 1540, light: true, op: 0.6 }], ferns: [{ x: 120, y: 1640, angle: -1.3, len: 520, count: 7 }, { x: 980, y: 1960, angle: -1.9, len: 420 }], liana: 3 });
    const man = `<g id="cu2-man">${person(r, 470, 1560, 0.95)}</g>`;
    shot(2, `${water}${boat}${bank}${wood}${man}`, "50% 60%");
    motion.push({ type: "oscillate", sel: "#cu2-boat", prop: "y", from: -6, to: 6, cycle: T.s2.bob, start: cuts[1] - F, duration: cuts[2] - cuts[1] + F * 2 });
    motion.push({ type: "sequence", sel: "#cu2-man", keys: [{ at: T.s2.walk[0], from: { x: 0, opacity: 1 }, to: { x: -230, opacity: 0.15 }, duration: T.s2.walk[1], ease: "sine.in" }] });
  }

  // 3 · El silbido cruza la selva; la paca huye; huellas pequeñas que parecen ir al río.
  {
    const r = rng.fork(3);
    const wood = jungle(r, { prefix: "cu3", trunks: [{ x: 90, w: 120 }, { x: 330, w: 70, light: true, op: 0.75 }, { x: 640, w: 90 }, { x: 900, w: 60, light: true, op: 0.7 }, { x: 1050, w: 110 }], ferns: [{ x: 200, y: 1960, angle: -1.3, len: 520 }, { x: 880, y: 1960, angle: -1.85, len: 520 }], liana: 6 });
    const w = whistle(-60, 760, 1140, 46, 5.5);
    const stroke = `<g id="cu3-whistle"><path id="cu3-whistle-path" d="${w.d}" fill="none" stroke="${PAPER}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${w.len}" stroke-dashoffset="${w.len}" opacity="0.9"/></g>`;
    const runner = `<g id="cu3-paca">${paca(r, 560, 1560, 1.1)}</g>`;
    const close = `<g id="cu3-close"><rect x="-60" y="-60" width="1200" height="2040" fill="#4a443b"/><path d="${blob(r, 540, 1100, 620, 900, 18, 0.1)}" fill="#6a6357"/>${printTrail(r, { count: 7, x0: 520, y0: 1720, x1: 600, y1: 520, s0: 2.1, s1: 1.0, prefix: "cu3-p", spread: 40 })}<g id="cu3-hint"><path d="${blob(r, 700, 300, 520, 140, 14, 0.15)}" fill="${PAPER}" opacity="0.5"/></g></g>`;
    shot(3, `${wood}${stroke}${runner}${close}`);
    motion.push({ type: "sequence", sel: "#cu3-whistle-path", keys: [{ at: T.s3.whistle[0], from: { strokeDashoffset: w.len }, to: { strokeDashoffset: 0 }, duration: T.s3.whistle[1], ease: "sine.inOut" }] });
    motion.push({ type: "sequence", sel: "#cu3-whistle", keys: [{ at: T.s3.whistle[0] + T.s3.whistle[1], from: { opacity: 1 }, to: { opacity: 0 }, duration: 0.8 }] });
    motion.push({ type: "sequence", sel: "#cu3-paca", keys: [{ at: T.s3.pacaRun[0], from: { x: 0, opacity: 1 }, to: { x: 700, opacity: 0 }, duration: T.s3.pacaRun[1], ease: "power2.in" }] });
    motion.push({ type: "sequence", sel: "#cu3-close", keys: [{ at: T.s3.closeup[0], from: { opacity: 0 }, to: { opacity: 1 }, duration: T.s3.closeup[1] }] });
    motion.push({ type: "sequence", sel: "#cu3-hint", keys: [{ at: T.s3.riverHint[0], from: { opacity: 0.2 }, to: { opacity: 1 }, duration: T.s3.riverHint[1] }] });
  }

  // 4 · Perdido entre raíces y niebla; olor a hojas podridas; el silbido, más cerca; sin río.
  {
    const r = rng.fork(4);
    const wood = jungle(r, { prefix: "cu4", trunks: [{ x: 0, w: 150 }, { x: 260, w: 90 }, { x: 520, w: 50, light: true, op: 0.8 }, { x: 760, w: 100 }, { x: 1080, w: 140 }], ferns: [{ x: 120, y: 1980, angle: -1.25, len: 600 }, { x: 960, y: 1980, angle: -1.9, len: 600 }], liana: 8 });
    const leaves = Array.from({ length: 26 }, () => `<path d="${blob(r, r.range(0, 1080), r.range(1700, 1960), r.range(20, 50), r.range(8, 16), 9, 0.3)}" fill="${INK2}" opacity="${n(r.range(0.5, 0.9) * 100) / 100}"/>`).join("");
    const roots = `<path d="${grassBand(r, { x0: -40, x1: 1120, baseY: 1990, height: [40, 160], density: 0.12 })}" fill="${INK}"/>`;
    const man = `<g id="cu4-man"><g id="cu4-bob">${person(r, 560, 1700, 1.15)}</g></g>`;
    const w = whistle(-60, 900, 1140, 70, 4);
    const stroke = `<path id="cu4-whistle" d="${w.d}" fill="none" stroke="${PAPER}" stroke-width="16" stroke-linecap="round" stroke-dasharray="${w.len}" stroke-dashoffset="${w.len}" opacity="0.85"/>`;
    shot(4, `${wood}${leaves}${man}${roots}${stroke}`, "50% 70%");
    motion.push({ type: "oscillate", sel: "#cu4-bob", prop: "y", from: 0, to: -10, cycle: T.s4.walkCycle, start: cuts[3], duration: cuts[4] - cuts[3] });
    motion.push({ type: "sequence", sel: "#cu4-whistle", keys: [{ at: T.s4.whistle[0], from: { strokeDashoffset: w.len }, to: { strokeDashoffset: 0 }, duration: T.s4.whistle[1], ease: "sine.inOut" }, { at: T.s4.whistle[0] + T.s4.whistle[1], from: { opacity: 0.85 }, to: { opacity: 0 }, duration: 0.6 }] });
  }

  // 5 · Primer plano: la mano junto a una huella; el talón está adelante.
  {
    const r = rng.fork(5);
    const ground = `<rect x="-60" y="-60" width="1200" height="2040" fill="#57514698"/><path d="${blob(r, 540, 1000, 700, 1000, 18, 0.08)}" fill="#6f685b" opacity="0.7"/>`;
    const big = `<g id="cu5-print">${footprint(560, 1080, 6.2, 180, INK, 0.9)}</g>`;
    const glow = `<g id="cu5-heel"><ellipse cx="560" cy="990" rx="190" ry="190" fill="url(#cu-spot)"/></g>`;
    const fingers = [[790, 610, 150], [838, 600, 168], [886, 604, 160], [930, 614, 138]].map(([x, y, l]) => `<rect x="${x - 19}" y="${y - l}" width="38" height="${l}" rx="19"/>`).join("");
    const thumb = `<rect x="960" y="430" width="36" height="120" rx="18" transform="rotate(-38 978 490)"/>`;
    const hand = `<g id="cu5-hand" fill="${INK2}"><path d="${blob(r, 870, 430, 115, 100, 12, 0.05)}"/>${fingers}${thumb}<rect x="860" y="80" width="190" height="380" rx="80" transform="rotate(-24 955 270)"/></g>`;
    shot(5, `${ground}${glow}${big}${hand}`, "50% 50%");
    motion.push({ type: "sequence", sel: "#cu5-hand", keys: [{ at: T.s5.lower[0], from: { y: -260, opacity: 0.6 }, to: { y: 0, opacity: 1 }, duration: T.s5.lower[1], ease: "sine.out" }] });
    motion.push({ type: "sequence", sel: "#cu5-heel", keys: [{ at: cuts[4], from: { opacity: 0 }, to: { opacity: 0 }, duration: 0.1 }, { at: T.s5.heel[0], from: { opacity: 0 }, to: { opacity: 1 }, duration: T.s5.heel[1] }] });
  }

  // 6 · El Curupira: pequeño, pelo rojo, pies al revés, entre los troncos. Silbido lejano.
  {
    const r = rng.fork(6);
    const wood = jungle(r, { prefix: "cu6", trunks: [{ x: 120, w: 130 }, { x: 380, w: 60, light: true, op: 0.7 }, { x: 760, w: 70, light: true, op: 0.7 }, { x: 980, w: 140 }], ferns: [{ x: 160, y: 1980, angle: -1.2, len: 640, count: 7 }, { x: 930, y: 1980, angle: -1.95, len: 640, count: 7 }], liana: 7 });
    const cx = 560;
    const by = 1380;
    // de perfil, caminando hacia la izquierda: la cara mira a la izquierda; los pies, con los
    // dedos hacia la derecha (hacia atrás), son el rasgo que hace única a la leyenda
    const bodyD = brush(r, [[cx + 6, by - 300], [cx, by - 215], [cx + 4, by - 130]], 150, 128, 0.05);
    const arm = brush(r, [[cx - 4, by - 280], [cx - 40, by - 220], [cx - 60, by - 165]], 26, 16);
    const legs = brush(r, [[cx - 14, by - 135], [cx - 26, by - 70], [cx - 30, by - 14]], 52, 40) + brush(r, [[cx + 22, by - 135], [cx + 30, by - 70], [cx + 36, by - 14]], 52, 40);
    const foot = (x) => `<path d="${blob(r, x + 26, by, 48, 16, 12, 0.05)}"/>${[0, 1, 2, 3, 4].map((t) => `<ellipse cx="${x + 64 + t * 4}" cy="${by - 9 + t * 4.5}" rx="7" ry="5.5"/>`).join("")}`;
    const feet = `<g id="cu6-feet">${foot(cx - 34)}${foot(cx + 30)}</g>`;
    const head = `<circle cx="${cx}" cy="${by - 352}" r="56"/><path d="${blob(r, cx - 56, by - 340, 16, 12, 8, 0.05)}"/>`;
    const hair = `<g id="cu6-hair" data-svg-origin="${cx} ${by - 350}" fill="${RED}">${Array.from({ length: 11 }, (_, i) => {
      const a = -Math.PI / 2 + 0.35 + (i - 5) * 0.26 + r.range(-0.08, 0.08);
      const L = r.range(80, 135);
      return `<path d="${brush(r, [[cx + Math.cos(a) * 40, by - 352 + Math.sin(a) * 40], [cx + Math.cos(a) * (40 + L * 0.6) + r.range(-12, 12), by - 352 + Math.sin(a) * (40 + L * 0.6)], [cx + Math.cos(a) * (40 + L), by - 352 + Math.sin(a) * (40 + L)]], 26, 3, 0.2)}"/>`;
    }).join("")}</g>`;
    const figure = `<g id="cu6-fig"><g fill="${INK}">${head}<path d="${bodyD}"/><path d="${arm}"/><path d="${legs}"/>${feet}</g>${hair}</g>`;
    const dark = `<rect id="cu6-dark" x="-60" y="-60" width="1200" height="2040" fill="url(#cu-dark)"/>`;
    const w = whistle(140, 600, 1000, 26, 6);
    const stroke = `<path id="cu6-whistle" d="${w.d}" fill="none" stroke="${PAPER}" stroke-width="5" stroke-linecap="round" stroke-dasharray="${w.len}" stroke-dashoffset="${w.len}" opacity="0.6"/>`;
    shot(6, `${wood}${figure}${dark}${stroke}`, "52% 62%");
    motion.push({ type: "sequence", sel: "#cu6-fig", keys: [{ at: T.s6.appear[0], from: { opacity: 0 }, to: { opacity: 1 }, duration: T.s6.appear[1], ease: "sine.out" }] });
    motion.push({ type: "sequence", sel: "#cu6-hair", keys: [{ at: T.s6.hair[0], from: { scale: 0.85, svgOrigin: `${cx} ${by - 350}` }, to: { scale: 1.08 }, duration: T.s6.hair[1], ease: "sine.out" }] });
    motion.push({ type: "sequence", sel: "#cu6-feet", keys: [{ at: T.s6.feet[0], from: { opacity: 0.55 }, to: { opacity: 1 }, duration: T.s6.feet[1] }] });
    motion.push({ type: "sequence", sel: "#cu6-whistle", keys: [{ at: T.s6.whistle[0], from: { strokeDashoffset: w.len }, to: { strokeDashoffset: 0 }, duration: T.s6.whistle[1] }, { at: T.s6.whistle[0] + T.s6.whistle[1], from: { opacity: 0.6 }, to: { opacity: 0 }, duration: 0.6 }] });
    motion.push({ type: "sequence", sel: "#cu6-dark", keys: [{ at: T.s6.pullBack[0], from: { opacity: 1 }, to: { opacity: 0.55 }, duration: T.s6.pullBack[1] }] });
  }

  // 7 · Amanecer gris: Raimundo junto a la canoa; los ganchos vacíos.
  {
    const r = rng.fork(7);
    const water = river(r, { y: 900, h: 560, idg: "cu-river-dawn" });
    const pole = `<path d="${brush(r, [[600, 1080], [760, 1040], [930, 1010]], 7, 5)}" fill="${INK}"/><path d="${brush(r, [[880, 1238], [884, 1130], [888, 1020]], 9, 7, 0.05)}" fill="${INK}"/>`;
    const hooks = `<g id="cu7-hooks">${[650, 730, 810].map((x, i) => `<path d="${brush(r, [[x, 1060 - i * 10], [x, 1112 - i * 10]], 3, 2)}" fill="${INK}"/><path d="M${x} ${1112 - i * 10} q 10 12 0 18" fill="none" stroke="${INK}" stroke-width="3"/>`).join("")}</g>`;
    const boat = `<g id="cu7-boat">${canoe(r, 760, 1250, 520)}${pole}${hooks}</g>`;
    const bank = `<path d="${blob(r, 300, 1600, 720, 170, 16, 0.12)}" fill="${INK2}" opacity="0.85"/>`;
    const man = person(r, 430, 1560, 0.9, "crouch");
    const birds = `<g id="cu7-birds">${[[250, 520], [330, 470], [420, 540]].map(([x, y]) => `<path d="${brush(r, [[x - 26, y], [x, y + 10], [x + 26, y - 2]], 6, 3)}" fill="${INK2}"/>`).join("")}</g>`;
    const mist = `<rect x="-60" y="820" width="1200" height="260" fill="${PAPER}" opacity="0.35"/>`;
    shot(7, `${water}${mist}${boat}${bank}<g fill="${INK}">${man}</g>${birds}`, "60% 60%");
    motion.push({ type: "oscillate", sel: "#cu7-boat", prop: "y", from: -3, to: 3, cycle: 3.4, start: cuts[5] - F, duration: cuts[6] - cuts[5] + F * 2 });
    motion.push({ type: "drift", sel: "#cu7-birds", x: [0, 260], y: [0, -90], start: T.s7.birds[0], duration: T.s7.birds[1] });
    motion.push({ type: "sequence", sel: "#cu7-hooks", keys: [{ at: T.s7.hooks[0], from: { opacity: 0.55 }, to: { opacity: 1 }, duration: T.s7.hooks[1] }] });
  }

  // 8 · Las huellas venían del monte; cierre en bucle hacia el plano 1.
  {
    const p8 = printsShot("cu8", 1); // misma semilla que el plano 1: el final enlaza con el inicio
    const monte = `<g id="cu8-monte"><path d="${blob(rng.fork(81), 540, 2040, 760, 330, 18, 0.1)}" fill="${INK}" opacity="0.9"/></g>`;
    shot(8, `<g id="cu8-river">${p8.river}</g>${p8.mud}${p8.prints}${monte}${p8.sideJungle}`, "50% 45%");
    // el rastro se recorre al revés: del río hacia el monte
    motion.push({ type: "sequence", sel: ".cu8-p", keys: [{ at: T.s8.trace[0], from: { opacity: 0.35 }, to: { opacity: 1, stagger: { each: -T.s8.trace[1] / 11 } }, duration: 0.3 }] });
    motion.push({ type: "sequence", sel: "#cu8-monte", keys: [{ at: T.s8.trace[0], from: { opacity: 0.4 }, to: { opacity: 1 }, duration: T.s8.trace[1] }, { at: T.s8.settle[0], from: { opacity: 1 }, to: { opacity: 0 }, duration: T.s8.settle[1], ease: "sine.inOut" }] });
  }

  // Niebla de aguada sobre todo (perspectiva atmosférica), texto en pantalla, viñeta y grano.
  layers.push({
    id: "cu-mist",
    depth: null,
    html: textureCanvas("fog", { seed: 17, color: PAPER, alpha: 0.32, scaleX: 4, scaleY: 2.2, threshold: -0.2, softness: 0.6, center: 0.5, spread: 0.3 }, { id: "cu-mist-canvas", width: 1080, height: 240, class: "cu-fog", style: "top:820px;height:520px" }),
  });
  motion.push({ type: "drift", sel: "#cu-mist-canvas", x: [-120, 160], start: 0, duration: T.duration });
  layers.push({ id: "cu-text", depth: null, html: `<div id="cu-caption">Amazonas, Brasil · al anochecer</div>` });
  motion.push({ type: "sequence", sel: "#cu-caption", keys: [{ at: T.s1.text[1] - 0.6, from: { opacity: 1 }, to: { opacity: 0 }, duration: 0.6 }] });
  layers.push({ id: "cu-vignette", depth: null, html: "" });
  layers.push({ id: "cu-grain", depth: null, html: textureCanvas("grain", { seed: 77, amount: T.grain.amount }, { id: "cu-grain-canvas", width: W + 100, height: H + 100 }) });
  motion.push({ type: "jitter", sel: "#cu-grain-canvas", fps: T.grain.fps, amount: 40, seed: 9, start: 0, duration: T.duration });
  for (let k = 1; k <= 8; k++) motion.push({ type: "sway", sel: `.cu${k}-fern`, seed: 30 + k, amplitude: [0.8, 2.0], cycle: [3.2, 4.8], start: Math.max(0, cuts[k - 1] - F), duration: Math.min(T.duration, cuts[k] + F) - Math.max(0, cuts[k - 1] - F) });

  const css = `
    #root .cu-full { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; }
    #root .cu-shot { opacity: 0; }
    #root #cu-s1 { opacity: 1; }
    #root #cu-night-wash { background: #24211d; opacity: ${T.night[0]}; }
    #root .cu-fog { position: absolute; left: -540px; width: 2160px; }
    #root #cu-caption {
      position: absolute; left: 0; right: 0; top: 230px; text-align: center;
      font-family: "DejaVu Serif", Georgia, serif; font-size: 54px; letter-spacing: 2px;
      color: ${PAPER}; text-shadow: 0 2px 10px rgba(10, 9, 8, 0.85);
    }
    #root #cu-vignette { background: radial-gradient(ellipse 80% 64% at 50% 52%, rgba(10, 9, 8, 0) 50%, rgba(10, 9, 8, 0.4) 82%, rgba(10, 9, 8, 0.7) 100%); }
    #root #cu-grain { overflow: hidden; mix-blend-mode: multiply; opacity: 0.16; }
    #root #cu-grain-canvas { position: absolute; left: -50px; top: -50px; width: ${W + 100}px; height: ${H + 100}px; }
`;
  return { id, background: PAPER, css, defs, layers, motion };
}
