# rendering

Motor visual 2D: de una escena declarada a un MP4 verificado. El render lo hace siempre **HyperFrames**; aquí no hay captura propia con Playwright.

| Módulo | Papel |
|---|---|
| `prng.js` | PRNG determinista (mulberry32) con utilidades |
| `svg.js` | Utilidades de marcado: polígonos con orientación normalizada, curvas Catmull-Rom, degradados |
| `composition.js` | Genera `index.html` (raíz que monta escenas y carga los runtimes locales) y `compositions/<escena>.html` (`<template>`, `#root`, `window.__timelines`) |
| `build.js` | `vf build`: carga `project.json`, `timing.json` y `scene.js`, y escribe `build/` con `vendor/` (GSAP + runtimes) |
| `verify.js` | ffprobe con recuento real de fotogramas, continuidad (diferencia entre fotogramas con FFmpeg) y auditoría de recursos externos |
| `contact-sheet.js` | Hoja de contacto rotulada con FFmpeg (`select` + `drawtext` + `tile`) |
| `render-project.js` | `vf render`: valida → construye → `hyperframes check` → `hyperframes render` → verifica → hoja de contacto → `output/render-report.json` |

## Contrato de una escena (`scene.js`)

```js
export default function scene({ width, height, fps, duration, timing, rng, project }) {
  return {
    id,          // id de la composición (prefijo de ids)
    background,  // color de fondo
    css,         // estilos de la escena (dentro de <template>)
    defs,        // <defs> SVG compartidos
    layers,      // [{ id, depth: 0..1 | null, html }] de fondo a primer plano; depth null = espacio de pantalla
    motion,      // [{ type: "camera" | "drift" | "oscillate" | "sway" | "wander" | "jitter" | "sequence", ... }]
  };
}
```

Las capas con `depth: null` (viñeta, grano) se marcan con `data-layout-allow-occlusion`: cubren el encuadre a propósito, y sin la marca `hyperframes check` las confundiría con un elemento que tapa la escena.
