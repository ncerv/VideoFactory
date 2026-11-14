# components

Componentes visuales 2D reutilizables. Son funciones puras de Node que reciben un generador con semilla (`createRng` de `src/rendering/prng.js`) y devuelven marcado SVG/HTML o `{ defs, body }`. Con la misma semilla producen siempre el mismo resultado.

| Módulo | Exporta | Uso |
|---|---|---|
| `conifer.js` | `coniferPath`, `treeLine` | Coníferas estilizadas como unión de pisos sin autointersecciones, e hileras con plano de suelo y claros |
| `bare-tree.js` | `bareTreePath` | Árboles desnudos por ramificación recursiva, con límites laterales para enmarcar |
| `trail.js` | `trail` | Sendero en perspectiva hacia un punto de fuga, con luz central, sombra interior, piedras y matas |
| `ground-cover.js` | `grassBand`, `fernFrond`, `fernClump` | Hierba y helechos en silueta; las frondas llevan `data-svg-origin` para balancearse |
| `celestial.js` | `moon`, `starField` | Luna texturizada con `feTurbulence` y halo; estrellas en grupos para centellear |
| `light.js` | `lightShafts` | Haces de luz con degradado y máscara, sin filtros de desenfoque |
| `particles.js` | `particleField`, `watcherEyes` | Partículas HTML escaladas por perspectiva; ojos en la oscuridad |
| `texture-canvas.js` | `textureCanvas` | Declara un `<canvas data-vf-texture>` que pinta `library/materials/vf-textures.js` |

Reglas:

- Solo 2D.
- Sin imágenes externas.
- Los ids van prefijados por escena.
- Las figuras que se combinan en un solo `<path>` usan `polygon`/`smoothPath`, que normalizan la orientación para que los solapamientos no abran huecos.
