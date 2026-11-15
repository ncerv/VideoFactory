---
name: video-production
description: Producción de vídeo 2D con VideoFactory, con HyperFrames para componer, Chromium para renderizar y FFmpeg para procesar y exportar. Úsala para crear o ajustar escenas, previsualizarlas, validarlas y renderizarlas; para comprobar si el entorno está listo; para ampliar el motor; o para trabajar con estilos artísticos, perfiles editoriales y servicios de IA (voz, música, alineación).
---

# video-production

Skill portable para producir vídeo **2D** con el motor VideoFactory. Funciona igual en el entorno remoto y en una computadora local (Linux, macOS o Windows).

> Esta Skill es un paquete de instrucciones, plantillas y scripts. **No contiene el motor VideoFactory**, que vive en su propio repositorio. Sin el motor, la Skill sigue sirviendo para diagnosticar el entorno y preparar archivos de proyecto.

| Carpeta | Para qué sirve |
|---|---|
| [references/catalog.md](references/catalog.md) | **Lo primero que hay que consultar al crear una escena**: componentes, patrones de movimiento, texturas y contrato de `scene.js` |
| [references/](references/) | Arquitectura, requisitos, pipeline, notas de HyperFrames y estilos (solo cuando hagan falta) |
| [templates/](templates/) | Plantillas de `project.json`, `storyboard.json` y composición HyperFrames |
| [scripts/](scripts/) | `detect-environment.mjs`: diagnóstico portable del entorno (solo Node.js 22+) |

## Primero: ¿qué tipo de tarea es?

| Tarea | Ejemplos | Dónde se trabaja |
|---|---|---|
| **A. Crear o ajustar una escena** (la habitual) | Nueva escena, cambiar colores, tiempos, encuadre, capas o animaciones de un proyecto | Solo en `projects/<id>/`: `scene.js`, `timing.json` y los manifiestos |
| **A′. Crear o ajustar el audio de una escena** | Música, ambiente o efectos con los generadores existentes; tiempos, niveles, stems | Solo en `projects/<id>/`: `audio.js`, `timing.json` y `audio.json` |
| **B. Desarrollar el motor** (excepcional) | Componente o patrón de movimiento útil para varias escenas, nuevo comando, corregir un fallo del motor | `library/`, `src/`, `schemas/`, `tests/` |

Ante la duda, es una tarea A. Pasa a B solo cuando una necesidad concreta no tenga solución con lo que ya existe **y** vaya a servir a otras escenas.

## A. Crear o ajustar una escena

1. **No reexplores.** Lee [references/catalog.md](references/catalog.md) y el `scene.js` de un proyecto parecido (por ejemplo `projects/night-forest-test/`). No releas toda la documentación ni audites el repositorio. Ejecuta `npx vf doctor` solo si el entorno es nuevo o algo falla.
2. **Compón con lo que hay:**
   - componentes de `library/components/`;
   - patrones de `library/motion/vf-motion.js`;
   - texturas de `library/materials/vf-textures.js`.

   Las particularidades de la escena (paleta, geometría, tiempos, capas propias) van en su `scene.js` y su `timing.json`, nunca en el motor.
3. **Itera barato.** Cada vuelta:
   - `npx vf preview projects/<id>` (~7 s): fotogramas clave a 540×960 y una hoja de contacto rotulada. Revisa `output/preview/frames/contact-sheet.jpg`.
   - Para revisar el movimiento: `npx vf preview projects/<id> --video` (~16 s), un MP4 borrador a 15 fps.
   - Declara los instantes clave en `timing.json` → `"preview": { "at": [...] }`, o usa `--at`.
4. **Entrega una sola vez.** `npx vf render projects/<id>` (~60 s) solo cuando la vista previa sea satisfactoria. Incluye `hyperframes check`, el render a 1080×1920 y 30 fps y la verificación de entrega. Revisa `output/contact-sheet.jpg`.
5. **Pruebas.** Los cambios que solo tocan `scene.js` o `timing.json` no necesitan `npm test`: `vf render` ya verifica la escena. Ejecuta `npm test` solo si cambió algo fuera de `projects/`.

### Economía de la iteración

- No vuelvas a ejecutar `vf render` para ajustes pequeños: usa `vf preview`.
- `vf build`, `vf check` y `vf render` reutilizan el resultado anterior si el contenido generado no cambió (hash). Usa `--force` solo si sospechas de la caché.
- Para volver a verificar un MP4 existente usa `npx vf verify`, que no vuelve a renderizar.
- No reconsideres decisiones de arquitectura ya establecidas sin un problema concreto y demostrado.
- **Informes breves.** Resultado, tiempos y errores. No repitas lo que ya muestran la CLI o el informe JSON.

## A′. Audio de una escena

1. Lee la sección de audio de [references/catalog.md](references/catalog.md) y el `audio.js` de `projects/audio-engine-test/`.
2. Compón con los generadores de `library/audio` (drone, viento, pulso, resonancia, whoosh, impacto, espacio). Los tiempos van en `timing.json`; usa `gainDb` como pico aproximado de cada capa.
3. `npx vf audio render projects/<id>` (~4 s) genera la mezcla y los stems y los verifica. Itera sobre él: es barato y no repite el render si nada cambió.
4. Como no puedes escuchar, revisa `audio-report.json`: niveles por stem, energía por bandas, `voiceBandDb`, sonoridad y fades. Mira también `review.png`. Deja la banda de 300–3000 Hz despejada si habrá narración.
5. Todo el audio se sintetiza: sin modelos generativos, bancos de sonidos, archivos descargados ni `Math.random`. La voz TTS es un subsistema aparte: solo se declaran sus segmentos en `audio.json → voice`.

## A″. Unir imagen y sonido

1. Crea `projects/<id>/av.json` (esquema `schemas/av-project.schema.json`). Debe referenciar un proyecto visual y uno de audio hermanos (`"../<visual>"`, `"../<audio>"`). Como modelo, usa `projects/av-integration-test/`.
2. `npx vf av render projects/<id>` reutiliza en caché el MP4 de `vf render` y la mezcla de `vf audio render`: si faltan, los genera una vez. Después copia el vídeo y codifica el audio a AAC sin tocar su ganancia.
3. Revisa `output/av-report.json → checks`: sincronía al principio y al final, duraciones, muestras y relleno AAC, vídeo copiado, nivel, bandas y presencia de cada stem. Los proyectos fuente no se modifican.
4. Eficiencia sin perder calidad:
   - **Fuentes:** si sus entradas funcionales no cambian, se reutilizan. Editar documentación no invalida ninguna caché, así que no fuerces por eso.
   - **`--force`:** repite solo el multiplexado. Regenera una fuente (`--force-video`, `--force-audio`, `--force-all`) solo si sospechas de su caché, porque el render visual cuesta minutos.
   - **WAV maestro:** es la referencia sin pérdida. El AAC es solo para la entrega; no edites ni sustituyas el WAV.
   - **Comprobaciones:** no se omiten nunca. Una entrega con `checks` en rojo no es válida.

## B. Desarrollar el motor

1. Lee solo los módulos afectados y sus pruebas.
2. Un componente o patrón nuevo debe ser genérico: parámetros en lugar de valores de una escena concreta, determinista con semilla, solo 2D y sin recursos externos. Documéntalo en [references/catalog.md](references/catalog.md) y en el README de su carpeta.
3. No modifiques el motor para resolver la necesidad de una sola escena: resuélvela en su `scene.js`.
4. Antes de hacer commit: `npm test`. Además, `npm run test:render` si cambió algo que afecta al render (`src/rendering`, `library/`, adaptadores o dependencias).
5. Optimiza solo con mediciones (tiempos de `render-report.json` o `preview.json`), no por suposición.

## Reglas obligatorias

- **Solo 2D.** No uses geometría, escenas ni modelos 3D (ni WebGL 3D, ni three.js, ni CSS 3D para simular volumen real). Los estilos que evocan materiales físicos se resuelven con ilustración, recortes y texturas 2D.
- **HyperFrames es el motor visual y de composición.** No lo sustituyas por capturas propias con Playwright y FFmpeg. Playwright solo se usa para pruebas.
- **FFmpeg** se usa para procesar, mezclar y exportar.
- **Node.js 22+** orquesta el trabajo. **Python 3.12 con uv** se usa solo en servicios de IA aislados.
- **Todo lo visual se genera con código** (SVG, Canvas procedural, CSS, GSAP): sin imágenes externas, fotografías ni imágenes generadas por IA. La profundidad se simula con capas, escala, opacidad, luz y parallax 2D.
- **Determinismo:** semillas en la geometría y el azar; nada de `Math.random` sin semilla, `Date.now`, `performance.now`, temporizadores ni `repeat: -1`.
- **Entrega:** 1080×1920, 30 fps, sin recursos externos, con `hyperframes check` sin errores y la verificación de `vf render` correcta. La vista previa nunca sustituye al render final.
- **Sin CDNs en las composiciones.** GSAP y cualquier otra librería se cargan desde una copia local (`vendor/`).
- **Sin telemetría ni publicación.** Ejecuta HyperFrames con `HYPERFRAMES_NO_TELEMETRY=1` y no uses `hyperframes publish`, que sube el proyecto a un servicio externo.
- **No inventes contenido editorial.** Si un perfil tiene el estado `awaiting-editorial-document`, su documento todavía no existe: no lo reconstruyas.
- **Sin servicios de pago** ni descargas de modelos que no se hayan pedido expresamente.
- **No eludas restricciones de red.** Si un host está bloqueado, informa de ello y propone una alternativa local.

## Fuera del repositorio

Detecta el entorno con `node <carpeta-de-esta-skill>/scripts/detect-environment.mjs [--json] [--network]`. Para una composición HyperFrames escrita a mano, parte de [templates/](templates/) y de [references/hyperframes.md](references/hyperframes.md). Los requisitos externos están en [references/requirements.md](references/requirements.md).
