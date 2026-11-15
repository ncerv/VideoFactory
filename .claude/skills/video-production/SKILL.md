---
name: video-production
description: Producción de vídeo 2D con VideoFactory, con HyperFrames para componer, Chromium para renderizar y FFmpeg para procesar y exportar. Úsala para producir un vídeo completo con el flujo editorial obligatorio (guion, aprobación, narración manual, recepción de la voz y producción); para crear o ajustar escenas, audio procedural y mezclas; para previsualizar, validar y renderizar; para comprobar el entorno; para ampliar el motor; o para trabajar con estilos artísticos y perfiles editoriales.
---

# video-production

Skill portable para producir vídeo **2D** con el motor VideoFactory. Funciona igual en el entorno remoto y en una computadora local (Linux, macOS o Windows).

> Esta Skill es un paquete de instrucciones, plantillas y scripts. **No contiene el motor VideoFactory**, que vive en su propio repositorio. Sin el motor, la Skill sigue sirviendo para diagnosticar el entorno y preparar archivos de proyecto.

| Carpeta | Para qué sirve |
|---|---|
| [references/catalog.md](references/catalog.md) | **Lo primero que hay que consultar al crear una escena**: componentes, patrones de movimiento, texturas y contrato de `scene.js` |
| [references/](references/) | Arquitectura, requisitos, pipeline, notas de HyperFrames y estilos (solo cuando hagan falta) |
| [templates/](templates/) | Plantillas de `project.json`, `storyboard.json`, `narration.json`, `mix.json` y composición HyperFrames |
| [scripts/](scripts/) | `detect-environment.mjs`: diagnóstico portable del entorno (solo Node.js 22+) |

## Primero: ¿qué tipo de tarea es?

| Tarea | Ejemplos | Dónde se trabaja |
|---|---|---|
| **Producir un vídeo completo** | Una leyenda de principio a fin | El [flujo obligatorio A–E](#flujo-obligatorio-de-un-vídeo-etapas-ae), sin saltarse etapas |
| **Escena visual** (la habitual) | Nueva escena, cambiar colores, tiempos, encuadre, capas o animaciones de un proyecto | Solo en `projects/<id>/`: `scene.js`, `timing.json` y los manifiestos |
| **Audio procedural** | Música, ambiente o efectos con los generadores existentes; tiempos, niveles, stems | Solo en `projects/<id>/`: `audio.js`, `timing.json` y `audio.json` |
| **Desarrollar el motor** (excepcional) | Componente o patrón útil para varias escenas, nuevo comando, corregir un fallo del motor | `library/`, `src/`, `schemas/`, `tests/` |

Ante la duda, es una tarea de escena. Desarrolla el motor solo cuando una necesidad concreta no tenga solución con lo que ya existe **y** vaya a servir a otras escenas.

## Flujo obligatorio de un vídeo (etapas A–E)

Cada etapa empieza solo cuando la anterior está cerrada. VideoFactory **no genera voz**: la narración se genera fuera, a mano, y se recibe como archivo.

| Etapa | Quién | Resultado | Para avanzar |
|---|---|---|---|
| **A. Desarrollo editorial** | Claude | Tema elegido, guion definitivo, escenas narrativas y texto completo de la voz | Guion completo |
| **B. Aprobación del guion** | Usuario | Versión editorial definitiva (`vf script approve`) | Aprobación **explícita** del usuario |
| **C. Narración manual** | Usuario | Voz generada a mano en Google AI Studio | El usuario entrega el WAV o MP3 |
| **D. Recepción de la voz** | Claude | `vf voice ingest`: validación, copia de producción y hashes | Informe sin errores |
| **E. Producción audiovisual** | Claude | Escenas ajustadas a la voz real, música, efectos, mezcla, render y verificación | Comprobaciones en verde |

### A. Desarrollo editorial

1. Sigue el **documento editorial original** del perfil: `profiles/<perfil>/editorial/`, con su ruta en `profile.json → editorial.document`. No lo sustituyas, resumas ni reinventes. Si el perfil está en `awaiting-editorial-document`, el documento aún no existe: dilo y detente. No improvises otra metodología.
2. Con esa metodología: investiga y elige el tema, prepara el guion definitivo y organiza las escenas narrativas (`storyboard.json`).
3. Escribe en `projects/<id>/script/script.md` el texto completo que se leerá, sin etiquetas expresivas: la interpretación la dirige el perfil vocal. Crea `narration.json` con [templates/narration.json](templates/narration.json).
4. No empieces la producción audiovisual.

### B. Aprobación del guion

- El usuario revisa el guion y puede pedir cambios. Aplícalos y vuelve a presentarlo.
- Solo tras su aprobación explícita: `npx vf script approve projects/<id> [--script-version vN]`. El guion y el perfil vocal quedan fijados por SHA-256. Si el guion cambia después, la recepción de la voz se detiene hasta una nueva aprobación.

### C. Narración manual (no la generes)

- Entrega al usuario:
  - el texto aprobado de `script/script.md`;
  - el perfil vocal `profiles/voices/<id>.md` (actualmente `mystery-documentary`) para copiarlo en Google AI Studio;
  - la indicación de que la generación es manual.
- No uses la API de Google ni ninguna otra herramienta o modelo TTS, y no pidas claves.
- El usuario guarda el archivo descargado como `projects/<id>/voice/narration.wav` o `.mp3`, según indique `narration.json → source.file`.

### D. Recepción de la voz

- `npx vf voice ingest projects/<id> --pin`. Revisa `output/voice/narration-report.json`. El informe recoge:
  - formato, frecuencia, canales, duración y profundidad de bits;
  - la copia de producción PCM a 48 kHz y estéreo, con soxr cuando hay que remuestrear;
  - la duración conservada y la ausencia de clipping;
  - los hashes del guion, del perfil y de la voz.
- **El original no se modifica nunca** y `voice/` no se versiona: no subas grabaciones a GitHub.
- Si hay errores (por ejemplo, la conversión recortaría), no sigas: informa al usuario y pide otra exportación. No cambies la ganancia por tu cuenta.

### E. Producción audiovisual

1. **Tiempo real de la voz:** ajusta el storyboard y `timing.json` a `production.duration`.
   - Sin alineación precisa, no inventes marcas de tiempo por frase: planifica con el storyboard y la duración real.
   - Si el usuario aporta tiempos medidos, regístralos en `narration.json → segments` con `"alignment": "manual"`.
2. **Imagen:** visuales con código y animación GSAP, como en [Escena visual](#escena-visual), reutilizando componentes existentes.
3. **Música y efectos:** Tone.js, como en [Audio procedural](#audio-procedural). Deja libre la banda de 300–3000 Hz.
4. **Mezcla:** `mix.json` ([templates/mix.json](templates/mix.json)) y después `npx vf mix render projects/<id>`.
   - Cada pista lleva su `gainDb`; no normalices pistas por separado.
   - El ducking atenúa música y ambiente mientras suena la voz. Protege un efecto narrativo importante con `"duck": false`.
   - La sonoridad final se decide sobre la mezcla completa (`loudness`).
5. **Render e integración:** el render final (`vf render`) solo se hace después de recibir la narración. Después, `vf av render` con `"audio": { "use": "multitrack" }`.

## Escena visual

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

## Audio procedural

1. Lee la sección de audio de [references/catalog.md](references/catalog.md) y el `audio.js` de `projects/audio-engine-test/`.
2. Compón con los generadores de `library/audio` (drone, viento, pulso, resonancia, whoosh, impacto, espacio). Los tiempos van en `timing.json`; usa `gainDb` como pico aproximado de cada capa.
3. `npx vf audio render projects/<id>` (~4 s) genera la mezcla y los stems y los verifica. Itera sobre él: es barato y no repite el render si nada cambió.
4. Como no puedes escuchar, revisa `audio-report.json`: niveles por stem, energía por bandas, `voiceBandDb`, sonoridad y fades. Mira también `review.png`. Deja la banda de 300–3000 Hz despejada si habrá narración.
5. La música y los efectos se sintetizan: sin modelos generativos, bancos de sonidos, archivos descargados ni `Math.random`. La voz no se sintetiza en VideoFactory: llega por la etapa D y se mezcla con `vf mix render`.

## Imagen y sonido

1. Crea `projects/<id>/av.json` (esquema `schemas/av-project.schema.json`). Debe referenciar un proyecto visual y uno de audio hermanos (`"../<visual>"`, `"../<audio>"`). El audio puede ser la mezcla procedural (`"use": "mix"`) o la mezcla con narración de un proyecto con `mix.json` (`"use": "multitrack"`). Como modelo, usa `projects/av-integration-test/`.
2. `npx vf av render projects/<id>` reutiliza en caché el MP4 de `vf render` y la mezcla de `vf audio render`: si faltan, los genera una vez. Después copia el vídeo y codifica el audio a AAC sin tocar su ganancia.
3. Revisa `output/av-report.json → checks`: sincronía al principio y al final, duraciones, muestras y relleno AAC, vídeo copiado, nivel, bandas y presencia de cada stem. Los proyectos fuente no se modifican.
4. Eficiencia sin perder calidad:
   - **Fuentes:** si sus entradas funcionales no cambian, se reutilizan. Editar documentación no invalida ninguna caché, así que no fuerces por eso.
   - **`--force`:** repite solo el multiplexado. Regenera una fuente (`--force-video`, `--force-audio`, `--force-all`) solo si sospechas de su caché, porque el render visual cuesta minutos.
   - **WAV maestro:** es la referencia sin pérdida. El AAC es solo para la entrega; no edites ni sustituyas el WAV.
   - **Comprobaciones:** no se omiten nunca. Una entrega con `checks` en rojo no es válida.

## Desarrollar el motor

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
- **Sin voz generada aquí.** No instales ni integres modelos TTS (locales o por API). La narración se genera manualmente fuera y se recibe con `vf voice ingest`.
- **Puertas del flujo:** sin aprobación explícita del guion no hay narración; sin narración validada no hay render final.
- **Sin servicios de pago** ni descargas de modelos que no se hayan pedido expresamente.
- **No eludas restricciones de red.** Si un host está bloqueado, informa de ello y propone una alternativa local.

## Fuera del repositorio

Detecta el entorno con `node <carpeta-de-esta-skill>/scripts/detect-environment.mjs [--json] [--network]`. Para una composición HyperFrames escrita a mano, parte de [templates/](templates/) y de [references/hyperframes.md](references/hyperframes.md). Los requisitos externos están en [references/requirements.md](references/requirements.md).
