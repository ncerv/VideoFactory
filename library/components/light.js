// Haces de luz suaves (rayos de luna entre los árboles), sin filtros: solo degradados.
import { gradient, n, polygon } from "../../src/rendering/svg.js";

/**
 * beams: [{ to:[x,y], width0, width1, opacity }] desde un origen común.
 * Cada haz usa un degradado a lo largo de su eje y otro transversal mediante una máscara.
 */
export function lightShafts({ id, origin, beams, color }) {
  let defs = "";
  let body = "";
  beams.forEach((b, i) => {
    const [ox, oy] = origin;
    const [tx, ty] = b.to;
    const len = Math.hypot(tx - ox, ty - oy);
    const ux = (tx - ox) / len;
    const uy = (ty - oy) / len;
    const px = -uy;
    const py = ux;
    const pts = [
      [ox + px * b.width0, oy + py * b.width0],
      [tx + px * b.width1, ty + py * b.width1],
      [tx - px * b.width1, ty - py * b.width1],
      [ox - px * b.width0, oy - py * b.width0],
    ];
    const gid = `${id}-g${i}`;
    const xid = `${id}-x${i}`;
    defs += gradient("linear", gid, [[0, color, 0], [0.25, color, b.opacity], [0.7, color, b.opacity * 0.55], [1, color, 0]], { x1: n(ox), y1: n(oy), x2: n(tx), y2: n(ty), gradientUnits: "userSpaceOnUse" });
    // máscara transversal: bordes difusos sin feGaussianBlur
    const mx0 = (pts[0][0] + pts[3][0]) / 2;
    defs += gradient("linear", `${xid}-grad`, [[0, "#fff", 0], [0.5, "#fff", 1], [1, "#fff", 0]], { x1: n(pts[0][0]), y1: n(pts[0][1]), x2: n(pts[3][0]), y2: n(pts[3][1]), gradientUnits: "userSpaceOnUse" });
    defs += `<mask id="${xid}" maskUnits="userSpaceOnUse" x="-2000" y="-2000" width="6000" height="6000"><path d="${polygon(pts)}" fill="url(#${xid}-grad)"/></mask>`;
    body += `<path id="${id}-beam-${i}" d="${polygon(pts)}" fill="url(#${gid})" mask="url(#${xid})" data-cx="${n(mx0)}"/>`;
  });
  return { defs, body };
}
