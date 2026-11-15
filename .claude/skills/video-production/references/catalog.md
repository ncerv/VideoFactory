# Catálogo del motor visual (para crear escenas sin leer el código)

Rutas relativas al repositorio VideoFactory. Todo es determinista: cada generador recibe `rng` (`createRng(seed)`) o una `seed`. Ejemplo completo: `projects/night-forest-test/scene.js` y su `timing.json`.

## Contrato de `scene.js`

```js
// scene.js vive en projects/<id>/ e importa, con rutas relativas a esa carpeta,
// los componentes de library/components/index.js y las utilidades de src/rendering/svg.js.

export default function scene({ width, height, fps, duration, timing, rng, project }) {
  return {
    id: "mi-escena",          // prefijo de todos los ids (únicos en la página)
    background: "#050b11",
    css: "…",                 // estilos de la escena; selectores bajo #root
    defs: "…",                // <defs> SVG compartidos (degradados, filtros, máscaras)
    layers: [                 // de fondo a primer plano; el orden del DOM es el orden de pintado
      { id: "mf-sky", depth: 0.02, html: "…" },  // depth 0..1: la cámara la mueve por parallax
      { id: "mf-grain", depth: null, html: "…" }, // null: capa de pantalla (viñeta, grano), sin cámara
    ],
    motion: [/* especificaciones de vf-motion, abajo */],
  };
}
```

- Cada capa mide `width × height` (1080×1920). El SVG de una capa usa `<svg viewBox="0 0 1080 1920">…</svg>`.
- **`timing.json`**: `duration`, `fps` (igual a `project.output.fps`), `seed`, todos los tiempos de la escena y `preview.at` (instantes clave de revisión).
- **`project.json`**: `rendering.source: "scene.js"`, `rendering.timing: "timing.json"`, `rendering.dimension: "2d"`.

## Componentes (`library/components/index.js`)

| Función | Parámetros principales | Devuelve |
|---|---|---|
| `coniferPath(rng, o)` | `x, baseY, height, width, trunk?` | `d` de un abeto |
| `treeLine(rng, o)` | `count, x0, x1, baseY, height:[min,max], widthRatio:[a,b], baseJitter?, gap?:[xa,xb], groundTo?` | `d` de una hilera (más el suelo hasta `groundTo`) |
| `bareTreePath(rng, o)` | `x, baseY, angle (rad, -π/2 vertical), length, width, levels, spread?, curl?, upPull?, taper?, bounds?:{minX,maxX,minY}` | `d` de un árbol desnudo recursivo |
| `trail(rng, o)` | `id, vanish:[x,y], bottomY, bottomCenter, bottomHalf, sway, stones, tufts, edgeShade?, colors:{far,mid,near,lit,stone,stoneLit,edge}` | `{ defs, body }` del sendero en perspectiva |
| `grassBand(rng, o)` | `x0, x1, baseY, height:[a,b], density, lowZone?:[xa,xb], lowFactor?` | `d` de una franja de hierba |
| `fernClump(rng, o)` | `x, y, count, length, spreadAngle, baseAngle, fill, idPrefix, className` | `<g>` de frondas con `data-svg-origin` (para `sway`) |
| `moon(o)` | `id, cx, cy, r, colors:{core,mid,limb,halo}, seed?` | `{ defs, halo, disc }` |
| `starField(rng, o)` | `count, area:{x,y,w,h}, avoid?:{x,y,r}, groups, className, color` | `<g id="{className}-k">` por grupo (para `oscillate`) |
| `lightShafts(o)` | `id, origin:[x,y], color, beams:[{to:[x,y], width0, width1, opacity}]` | `{ defs, body }` |
| `particleField(rng, o)` | `count, area, className, idPrefix, size:[a,b], sizeAt?(y), avoid?(x,y)` | `<div>` con `data-depth-scale`; su aspecto se define en `css` |
| `watcherEyes(o)` | `id, x, y, spacing, size, color` | `<g id>` (opacidad) + `<g id-lids>` (parpadeo) |
| `textureCanvas(kind, params, attrs)` | `kind`: `sky`, `fog` o `grain` (ver texturas); `attrs`: `id`, `width`, `height`, `class`, `style` | `<canvas data-vf-texture>` |

**Utilidades** (`src/rendering/svg.js`):

- `polygon(pts)` y `smoothPath(pts, {closed, tension})`: normalizan la orientación, así que se pueden combinar muchas figuras en un solo `<path>`.
- `gradient("linear" | "radial", id, [[offset, color, opacity]], attrs)`.

`createRng(seed)` (`src/rendering/prng.js`) ofrece `rng()`, `rng.range(a,b)`, `rng.int(a,b)`, `rng.pick(arr)`, `rng.chance(p)` y `rng.fork(salt)`. `rng.fork` da a cada componente su propio generador independiente.

## Texturas (`textureCanvas`, pintadas por `vf-textures.js`)

| `kind` | Parámetros |
|---|---|
| `sky` | `seed`, `stops:[[pos, hex]]`, `glows:[{x, y, r, color, alpha, falloff, squash?}]` (en fracciones del lienzo), `clouds?:{seed, from, to, scaleX, scaleY, threshold, alpha, color}` |
| `fog` | `seed`, `color`, `alpha`, `scaleX`, `scaleY`, `threshold`, `softness`, `center`, `spread`, `octaves?` |
| `grain` | `seed`, `amount` |

Pinta la niebla a baja resolución interna (por ejemplo 1080×220) y amplíala por CSS: queda más suave y es más barata.

## Movimiento (`motion: [...]`, aplicado por `vf-motion.js`)

| `type` | Campos | Uso |
|---|---|---|
| `camera` | `origin:[fx,fy]`, `push`, `panX`, `panY`, `depthCurve`, `start`, `duration`, `ease` | Cámara 2D por parallax sobre todas las capas con `depth`; nunca expone bordes |
| `drift` | `sel`, `x:[a,b]`, `y?:[a,b]`, `start`, `duration`, `ease?` | Desplazamiento lineal (niebla, nubes) |
| `oscillate` | `sel`, `prop`, `from`, `to`, `cycle`, `start`, `duration`, `phase?: "from" \| "to"`, `ease?`, `transformOrigin?`, `svgOrigin?` | Luz que respira, centelleo |
| `sway` | `sel`, `seed`, `amplitude:[a,b]` (grados), `cycle:[a,b]`, `start`, `duration` | Balanceo con fase propia (elementos con `id` y `data-svg-origin`) |
| `wander` | `sel`, `seed`, `radius:[rx,ry]`, `fall?:[dx,dy]`, `hop:[a,b]`, `start`, `duration`, `flicker?:{range, hop, darkChance?}` | Luciérnagas y motas |
| `jitter` | `sel`, `fps`, `amount`, `seed`, `start`, `duration` | Grano de película |
| `sequence` | `sel`, `keys:[{at, from, to, duration, ease?}]` | Apariciones, parpadeos, atenuaciones puntuales |

Reglas:

- Dos patrones no pueden animar la misma propiedad del mismo elemento. Si lo necesitas, anida dos grupos: por ejemplo, `#x-dim` para `sequence` y dentro `#x-breath` para `oscillate`.
- Las capas con `depth` las anima `camera`: no les apliques otros transforms y anima siempre sus hijos.

## Audio procedural (`library/audio/index.js`, render con `vf audio render`)

Proyecto de audio: `audio.json` (formato, master, stems, voz) + `timing.json` + `audio.js`. Ejemplo: `projects/audio-engine-test/`.

```js
// audio.js — solo describe qué suena y cuándo; la síntesis está en los generadores.
export default function composition({ duration, sampleRate, timing: T, lib }) {
  const room = (ctx) => ctx.lib.space(ctx, T.space);      // mismo espacio (misma semilla) en cada stem
  return {
    id: "mi-audio",
    stems: [                                               // cada stem se renderiza por separado; mezcla = Σ stems
      { id: "drone", role: "music", gainDb: 0, build: (ctx) => ctx.lib.drone(ctx, { ...T.drone, send: room(ctx) }) },
      { id: "golpe", role: "sfx", build: (ctx) => ctx.lib.impact(ctx, { at: 4.2, gainDb: -12 }) },
    ],
  };
}
```

- `role` puede ser `music`, `ambience` o `sfx`. Con `voice.segments`, la música y el ambiente se atenúan (ducking) y los `sfx` no.
- `ctx` contiene `Tone`, `lib`, `out`, `rng` (con semilla), `noise(kind, s, seed)`, `duration`, `sampleRate` y `timing`.
- **Convención de nivel:** `gainDb` ≈ pico del generador aislado.

| Generador | Parámetros principales |
|---|---|
| `drone(ctx, o)` | `notes`, `start`, `end`, `attack`, `release`, `gainDb`, `wave`, `spread`, `count`, `cutoff`, `q`, `lfo:{rate, depth}`, `sub`, `pan`, `send`, `sendDb` |
| `wind(ctx, o)` | `start`, `end`, `color` (white/pink/brown), `gainDb`, `center:[min,max]`, `q`, `gustStep`, `intensity:[a,b]`, `whistle:{freq:[a,b], q, gainDb}` o `null`, `panRate`, `seed`, `send` |
| `pulse(ctx, o)` | `start`, `end`, `bpm`, `accelerando`, `pattern:[{offset, velocity}]`, `pitch` (Hz), `intensity:[from,to]`, `gainDb`, `lowpass`, `decay`, `send` |
| `resonance(ctx, o)` | `at`, `note`, `gainDb`, `distance` (0..1), `beat`, `pan`, `partials`, `send` |
| `whoosh(ctx, o)` | `start`, `duration`, `from`, `to` (Hz), `q`, `gainDb`, `peakAt`, `pan:[a,b]`, `color`, `seed`, `send` |
| `impact(ctx, o)` | `at`, `gainDb`, `body` (Hz), `drop`, `decay`, `click`, `send` |
| `space(ctx, o)` / `echo(ctx, o)` | `seconds`, `decay`, `preDelay`, `damping`, `wet`, `seed`, `highcut` / `time`, `feedback`, `wet`, `highcut`; devuelven el nodo de envío |

**Reglas del audio:**

- Nada de `Tone.Noise`, `Tone.Reverb`, `humanize` ni `probability`: usan `Math.random`, que el render bloquea. Para el ruido usa `ctx.noise`, y para la reverberación, `space`.
- Nada de `Freeverb`, `JCReverb`, `FeedbackCombFilter` ni `BitCrusher`, que dependen de AudioWorklet.
- Ni muestras ni URLs (`Tone.Player`, `Sampler`, `fetch`): la auditoría las rechaza.
- En Tone, `a.connect(b)` devuelve `a`. Para encadenar usa `a.chain(b, c, out)`.

**Revisión sin escuchar:** consulta en `output/audio-report.json` los campos `verification.spectrum` (energía por bandas), `voiceBandDb`, `loudness` y `stems[].peakDb/rmsDb`, y mira `output/review.png`. Ese espectrograma es orientativo; las medidas por bandas son las fiables.

## Coste de cada paso (4 CPU, sin GPU, 1080×1920, 10 s)

| Paso | Tiempo |
|---|---|
| `vf build` | ~0,1 s (0,1 s también sin cambios: no reescribe) |
| `vf preview` (8 fotogramas a 540×960) | ~7 s |
| `vf preview --video` (15 fps, borrador) | ~16 s |
| `vf check` | ~9 s, o ~0,3 s si el contenido no cambió |
| `vf render` | ~60 s, o ~0,3 s si nada cambió |
| `vf verify` | ~4 s |
| `vf audio render` (10 s, 5 stems) | ~4 s, o ~0,2 s si nada cambió |
| `vf av render` (fuentes en caché) | ~5 s, o ~0,4 s si nada cambió |
