// Utilidades mínimas para generar marcado SVG/HTML como texto, de forma determinista.

/** Redondea a d decimales para un SVG compacto y estable entre ejecuciones. */
export const n = (v, d = 1) => {
  const r = Number(v.toFixed(d));
  return Object.is(r, -0) ? 0 : r;
};

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
export const escapeAttr = (v) => String(v).replace(/[&<>"]/g, (c) => ESC[c]);

/** Serializa atributos; omite null/undefined/false. */
export function attrs(obj = {}) {
  return Object.entries(obj)
    .filter(([, v]) => v !== null && v !== undefined && v !== false)
    .map(([k, v]) => (v === true ? ` ${k}` : ` ${k}="${escapeAttr(v)}"`))
    .join("");
}

export const el = (tag, a = {}, children = "") => `<${tag}${attrs(a)}>${children}</${tag}>`;
export const selfClosing = (tag, a = {}) => `<${tag}${attrs(a)}/>`;

/** Área con signo (fórmula del lazo): positiva en sentido horario en coordenadas SVG. */
export function signedArea(points) {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

/**
 * Orienta todos los contornos en el mismo sentido. Así, al combinar muchas figuras en un solo
 * <path> con fill-rule nonzero, los solapamientos se suman en lugar de abrir huecos.
 */
export const orient = (points) => (signedArea(points) < 0 ? [...points].reverse() : points);

/** Polígono de segmentos rectos (orientación normalizada). */
export function polygon(points) {
  return `M${orient(points).map(([x, y]) => `${n(x)} ${n(y)}`).join("L")}Z`;
}

/**
 * Curva suave (Catmull-Rom convertida a Bézier cúbica) que pasa por todos los puntos.
 * closed=true cierra la figura de forma continua.
 */
export function smoothPath(points, { closed = false, tension = 0.5 } = {}) {
  const p = closed ? orient(points) : points;
  const len = p.length;
  if (len < 3) return polygon(p);
  const get = (i) => (closed ? p[(i + len) % len] : p[Math.max(0, Math.min(len - 1, i))]);
  let d = `M${n(p[0][0])} ${n(p[0][1])}`;
  const last = closed ? len : len - 1;
  for (let i = 0; i < last; i++) {
    const p0 = get(i - 1);
    const p1 = get(i);
    const p2 = get(i + 1);
    const p3 = get(i + 2);
    const t = tension / 3;
    const c1 = [p1[0] + (p2[0] - p0[0]) * t, p1[1] + (p2[1] - p0[1]) * t];
    const c2 = [p2[0] - (p3[0] - p1[0]) * t, p2[1] - (p3[1] - p1[1]) * t];
    d += `C${n(c1[0])} ${n(c1[1])} ${n(c2[0])} ${n(c2[1])} ${n(p2[0])} ${n(p2[1])}`;
  }
  return closed ? `${d}Z` : d;
}

/** Degradado lineal o radial como <linearGradient>/<radialGradient>. stops: [[offset, color, opacity?]]. */
export function gradient(kind, id, stops, a = {}) {
  const tag = kind === "radial" ? "radialGradient" : "linearGradient";
  const children = stops
    .map(([offset, color, opacity = 1]) => selfClosing("stop", { offset, "stop-color": color, "stop-opacity": opacity }))
    .join("");
  return el(tag, { id, ...a }, children);
}
