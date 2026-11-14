# VideoFactory

Motor de producción de vídeo **2D**. Node.js orquesta el trabajo, **HyperFrames** compone y renderiza con Chromium y **FFmpeg** procesa y exporta. Los servicios de IA (voz, música y alineación) son procesos Python independientes.

> **Estado (v0.1.0):** base del proyecto, CLI `vf` (`--version`, `doctor`, `project validate`, `build`, `render`), esquemas, registro de estilos, interfaces de los servicios de IA, Skill `video-production` y **primera versión del motor visual 2D**, probada con la escena [`projects/night-forest-test`](projects/night-forest-test/README.md). Los motores de storyboard, assets y audio están pendientes.

## Requisitos

| Herramienta | Versión |
|---|---|
| Node.js | 22 o superior |
| FFmpeg + ffprobe | 6 o superior |
| Chrome o Chromium | Reciente (lo usa HyperFrames) |
| uv + Python 3.12 | Solo para los servicios de IA (todavía no instalados) |

## Inicio rápido

```bash
npm install                                     # instala HyperFrames, GSAP y Ajv (versiones fijadas)
npx vf --version
npx vf doctor                                   # herramientas, versiones y limitaciones
npx vf doctor --network                         # además comprueba el acceso a hosts externos
npx vf project validate projects/example-minimal
npx vf build projects/night-forest-test         # genera la composición HyperFrames desde scene.js + timing.json
npx vf preview projects/night-forest-test       # revisión rápida: fotogramas clave a 540×960 (~7 s)
npx vf preview projects/night-forest-test --video   # MP4 borrador a 540×960 y 15 fps (~16 s)
npx vf render projects/night-forest-test        # final: check + render 1080×1920 + verificación + hoja de contacto (~60 s)
npx vf verify projects/night-forest-test        # vuelve a verificar el MP4 final sin renderizar
npm test                                        # pruebas unitarias
npm run test:render                             # integración: render real con HyperFrames (~1-2 min sin GPU)
```

## Motor visual 2D

Una escena se describe con código y se genera de forma determinista:

```
projects/<id>/scene.js + timing.json
        │  vf build (Node: geometría SVG con semilla desde library/components)
        ▼
build/index.html + compositions/<escena>.html + vendor/{gsap, vf-textures, vf-motion}.js
        │  vf render
        ▼
hyperframes check → hyperframes render (Chromium + FFmpeg) → ffprobe + continuidad + auditoría → output/
```

- **Geometría:** componentes de `library/components` (árboles, sendero, luna, haces, partículas…). Son funciones puras con semilla.
- **Texturas:** `library/materials/vf-textures.js` pinta Canvas procedurales (cielo con *dithering*, niebla fBm, grano) al cargar la escena.
- **Movimiento:** `library/motion/vf-motion.js` convierte especificaciones declarativas en tweens GSAP deterministas (cámara 2D por parallax, deriva, oscilación, balanceo, deambular, secuencias).
- **Verificación:** resolución, fps, número exacto de fotogramas, duración, códec, continuidad entre fotogramas y ausencia de recursos externos. El resultado queda en `output/render-report.json`.

Flujo recomendado: iterar con `vf preview` y renderizar con `vf render` una sola vez al final. `vf build`, `vf check` y `vf render` reutilizan su resultado anterior cuando el contenido generado es idéntico (hash); `--force` los rehace.

| Modo | Resolución | FPS | Codificación | `hyperframes check` | Verificación de entrega |
|---|---|---|---|---|---|
| `vf preview` | 540×960 (escala 0,5 de la misma escena) | Instantes elegidos | PNG | No | No |
| `vf preview --video` | 540×960 | 15 | `--quality draft` | No | No |
| `vf render` | 1080×1920 | 30 | `--quality looks` (CRF 16) | Sí (en caché por contenido) | Sí |

Los vídeos, las hojas de contacto, `build/` y `build-preview/` se generan y no se versionan.

## Motor de audio procedural

Música y efectos generados solo por síntesis (Tone.js, render offline en Node), deterministas y verificados:

```bash
npx vf audio render projects/audio-engine-test   # mix.wav + stems/*.wav (48 kHz, 16 bits, estéreo) + audio-report.json + review.png
```

- **Generadores** (`library/audio`): drone, viento, pulso, resonancia, whoosh, impacto, espacio y eco.
- **Motor** (`src/audio`): ruido y reverberaciones con semilla, WAV PCM con dither con semilla, fades, techo de pico, ducking por segmentos de voz y verificación (ffprobe, clipping, sonoridad `ebur128`, bandas y recursos externos).
- **Voz TTS:** queda como subsistema independiente. El contrato de la mezcla audiovisual final está en `schemas/audio-mix.schema.json`.

## Arquitectura

| Componente | Papel |
|---|---|
| Node.js 22+ | Orquestación y CLI `vf` |
| HyperFrames | Motor visual y de composición 2D (composiciones HTML + GSAP) |
| Chromium | Navegador que usa HyperFrames para renderizar |
| FFmpeg | Procesamiento, mezcla y exportación |
| Python 3.12 + uv | Solo en los servicios de IA, cada uno en su propio entorno |
| Playwright | Solo para pruebas, nunca en producción |

La producción es **exclusivamente 2D**: no se usa geometría ni modelos 3D.

## Estructura

```
.claude/skills/video-production/   Skill portable (SKILL.md, references, templates, scripts)
schemas/                           Esquemas JSON: proyecto, storyboard, perfil, estilos, servicios
src/
  cli/                             CLI vf
  orchestrator/                    Pipeline y diagnóstico del entorno
  adapters/                        HyperFrames, FFmpeg y servicios Python
  storyboard/ assets/ audio/       Etapas del pipeline (pendientes)
  rendering/                       Generación de composiciones y render
  validation/                      Validación de proyectos
services/python/                   Servicios de IA: tts (Qwen3-TTS), music (ACE-Step), alignment (WhisperX)
library/                           art-styles, compositions, motion, materials, transitions, components
profiles/latin-american-legends/   Perfil editorial (pendiente de su documento)
projects/                          Proyectos de vídeo (example-minimal incluido)
tests/                             Pruebas (node:test)
```

## Skill `video-production`

La carpeta `.claude/skills/video-production/` no depende del resto del repositorio. Para distribuirla, comprime **la carpeta** de modo que el ZIP contenga `video-production/` en su raíz:

```bash
cd .claude/skills && zip -r video-production.zip video-production
```

En Windows se puede usar «Enviar a → Carpeta comprimida» sobre la carpeta. El ZIP contiene solo la Skill, no el motor VideoFactory.

## Decisiones técnicas de esta entrega

- **Versiones fijadas:** todas las dependencias directas usan versión exacta. El detalle está en [Dependencias](#dependencias).
- **GSAP local:** las composiciones cargan `vendor/gsap.min.js`. Los CDNs pueden estar bloqueados (`cdn.jsdelivr.net` lo está en el entorno remoto) y hacen el render dependiente de la red.
- **Sin telemetría:** el adaptador ejecuta HyperFrames con `HYPERFRAMES_NO_TELEMETRY=1`. No se usa `hyperframes publish`.

## Dependencias

| Paquete | Versión | Notas |
|---|---|---|
| `hyperframes` | **0.8.229** | **Base provisional del motor.** No se actualiza hasta evaluar la compatibilidad con HyperFrames 0.9.46 (ver abajo). |
| `gsap` | 3.15.0 | Misma versión que empaqueta HyperFrames 0.8.229. Licencia: GSAP Standard "no charge" (https://gsap.com/standard-license). |
| `ajv` | 8.20.0 | Validación de los esquemas JSON (2020-12). |
| `tone` | 15.1.22 | Síntesis de audio y render offline (`Tone.Offline`). MIT. |
| `node-web-audio-api` | 2.2.0 | Web Audio API nativa (Rust) para Node: permite `Tone.Offline` sin navegador. Incluye binarios para Linux, macOS y Windows. BSD-3-Clause. |
| `undici` (transitiva) | 7.30.2 | Forzada por un override **acotado a `hyperframes`** (`"overrides": { "hyperframes": { "undici": "7.30.2" } }`). |

### Override de seguridad de `undici`

HyperFrames 0.8.229 declara `undici` con versión exacta **7.25.0**, afectada por varias vulnerabilidades publicadas. El override la sustituye por **7.30.2**, que incluye las correcciones publicadas el 5 de noviembre de 2026 sobre 7.30.1.

- Es el mismo número mayor (7.x), así que la API es compatible por semver.
- Solo afecta al árbol de `hyperframes`, que es el único paquete que depende de `undici`.
- HyperFrames solo usa `undici` en `fetchPublic` (`Agent` + `fetch` con una resolución DNS propia) para descargar recursos remotos. `tests/dependencies.test.js` ejercita esa misma API con la versión resuelta, y `npm run test:render` verifica que el render sigue funcionando.
- El override debe revisarse, y retirarse si deja de ser necesario, en cada actualización de HyperFrames.

### GSAP local y licencia

`vendorGsap()` (`src/adapters/hyperframes.js`) copia `node_modules/gsap/dist/gsap.min.js` **sin modificarlo** a `compositions/vendor/`. Así se conserva su cabecera `@license`. Junto a la copia escribe `vendor/gsap.LICENSE.txt` con la versión y la licencia. La carpeta `vendor/` se genera en cada render y no se versiona.

### Evaluación pendiente: HyperFrames 0.9.46

Antes de actualizar el motor hay que:

1. Revisar los cambios entre 0.8.229 y 0.9.46: CLI (`render`, `lint`), formato de composición y versión de GSAP empaquetada.
2. Comprobar las dependencias de 0.9.46, en particular la versión de `undici`, y decidir si el override sigue haciendo falta.
3. Actualizar en una rama aparte, ejecutar `npm test`, `npm run test:render` y `npm audit`, y comparar visualmente el render de `projects/example-minimal`.
4. Si se cambia de versión de GSAP, mantenerla alineada con la que use HyperFrames.
