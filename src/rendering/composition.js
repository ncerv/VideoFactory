// Generación del HTML de HyperFrames a partir de una escena declarada.
// Sigue el formato de HyperFrames 0.8.229 (references/format.md):
//  - index.html raíz que solo monta escenas (data-composition-src) y carga los runtimes locales;
//  - un archivo por escena con todo dentro de <template>, raíz #root y su timeline en window.__timelines.

import { attrs, escapeAttr } from "./svg.js";

/** Runtimes de navegador que se copian a build/vendor/ y se cargan en la raíz (sin CDN). */
export const VENDOR_SCRIPTS = ["vendor/gsap.min.js", "vendor/vf-textures.js", "vendor/vf-motion.js"];

const json = (v) => JSON.stringify(v).replace(/</g, "\\u003c");

/**
 * Archivo de escena (subcomposición).
 * @param scene { id, width, height, duration, css, defs, layers:[{id, depth, html, className?, attrs?}], motion:[...] }
 */
export function sceneFile(scene) {
  const { id, width, height, duration } = scene;
  const layers = scene.layers
    .map((l) => {
      const a = { id: l.id, class: ["vf-layer", l.className].filter(Boolean).join(" "), ...(l.attrs || {}) };
      if (l.depth !== null && l.depth !== undefined) a["data-depth"] = l.depth;
      // Capas de tratamiento en espacio de pantalla (viñeta, grano): cubren el encuadre a propósito.
      else a["data-layout-allow-occlusion"] = true;
      return `      <div${attrs(a)}>\n        ${l.html}\n      </div>`;
    })
    .join("\n");

  const cameraLayers = scene.layers.filter((l) => typeof l.depth === "number").map((l) => ({ sel: `#${l.id}`, depth: l.depth }));
  const motion = scene.motion.map((m) => (m.type === "camera" ? { ...m, layers: cameraLayers } : m));

  return `<template>
  <style>
    #root {
      position: absolute;
      inset: 0;
      overflow: hidden;
      background: ${scene.background || "#000"};
    }
    #root .vf-layer {
      position: absolute;
      left: 0;
      top: 0;
      width: ${width}px;
      height: ${height}px;
      will-change: transform;
    }
    #root .vf-layer > svg {
      position: absolute;
      left: 0;
      top: 0;
      width: ${width}px;
      height: ${height}px;
      overflow: visible;
    }
${scene.css}
  </style>
  <div id="root" data-composition-id="${escapeAttr(id)}" data-width="${width}" data-height="${height}" data-duration="${duration}" data-layout-allow-overflow>
    <svg class="vf-defs" width="0" height="0" aria-hidden="true" style="position:absolute"><defs>${scene.defs}</defs></svg>
    <div id="${escapeAttr(id)}-stage" class="vf-stage">
${layers}
    </div>
  </div>
  <script>
    (function () {
      var stage = document.getElementById(${json(`${id}-stage`)});
      VFTextures.paintAll(stage);
      var tl = gsap.timeline({ paused: true });
      VFMotion.apply(tl, ${json(motion)}, ${json({ width, height, duration })});
      window.__timelines[${json(id)}] = tl;
    })();
  </script>
</template>
`;
}

/** index.html raíz: monta las escenas en orden y carga los runtimes locales. */
export function rootFile({ title, width, height, fps, duration, background, scenes }) {
  const hosts = scenes
    .map(
      (s, i) =>
        `      <div id="${escapeAttr(s.id)}" data-composition-id="${escapeAttr(s.id)}" data-composition-src="compositions/${escapeAttr(s.id)}.html" data-start="${s.start}" data-duration="${s.duration}" data-track-index="${i + 1}" data-track-kind="graphics" data-width="${width}" data-height="${height}"></div>`,
    )
    .join("\n");
  return `<!doctype html>
<!-- Generado por VideoFactory (vf build). No editar a mano: se regenera desde scene.js y timing.json. -->
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${width}, height=${height}" />
    <title>${escapeAttr(title)}</title>
${VENDOR_SCRIPTS.map((src) => `    <script src="${src}"></script>`).join("\n")}
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: ${width}px; height: ${height}px; overflow: hidden; background: ${background}; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${duration}" data-width="${width}" data-height="${height}" data-fps="${fps}">
${hosts}
    </div>
    <script>
      window.__timelines["main"] = gsap.timeline({ paused: true });
    </script>
  </body>
</html>
`;
}
