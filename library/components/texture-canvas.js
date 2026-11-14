// Declaración de un <canvas> que pinta vf-textures.js al cargar la escena (cielo, niebla, grano).
import { attrs } from "../../src/rendering/svg.js";

/**
 * @param kind "sky" | "fog" | "grain"
 * @param params parámetros del pintor (se serializan en data-vf-params)
 * @param a atributos del canvas: id, width, height (resolución interna), class, style
 */
export function textureCanvas(kind, params, a) {
  return `<canvas${attrs({ ...a, "data-vf-texture": kind, "data-vf-params": JSON.stringify(params) })}></canvas>`;
}
