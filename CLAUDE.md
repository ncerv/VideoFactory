# CLAUDE.md — Normas del proyecto VideoFactory

## Arquitectura (decisiones cerradas: no cambiarlas sin aprobación explícita)

1. **Node.js 22+** es el entorno principal de orquestación. El código es ESM en JavaScript (`"type": "module"`).
2. **HyperFrames** es el motor visual y de composición 2D. **No se sustituye** por una implementación propia de Playwright + FFmpeg.
3. **FFmpeg** se usa para procesar, mezclar y exportar.
4. **Chromium** lo usa HyperFrames para renderizar.
5. **Playwright** solo puede usarse en pruebas, nunca como motor de producción.
6. **Python** se usa exclusivamente en los servicios de IA de `services/python/`, independientes del orquestador. Cada servicio tiene su propio entorno **uv** con **Python 3.12**.
7. **Solo 2D**: no se usa geometría, modelos ni escenas 3D.

## Reglas de trabajo

- **No instalar** modelos ni sus dependencias (Qwen3-TTS, ACE-Step, WhisperX…) ni descargar pesos sin una petición expresa.
- **No eludir** las restricciones de red del entorno. Si un host está bloqueado, informar de ello.
- **No usar servicios de pago.** No ejecutar `hyperframes publish`. Mantener `HYPERFRAMES_NO_TELEMETRY=1`.
- **No inventar contenido editorial.** El documento del perfil `latin-american-legends` se incorporará íntegro más adelante.
- **Sin CDNs** en las composiciones: GSAP se carga desde `vendor/` (ver `vendorGsap` en `src/adapters/hyperframes.js`).
- **Dependencias con versión exacta** (`--save-exact`), elegidas entre publicaciones con algo de recorrido. Ejecutar `npm audit` después de cada cambio.
- **HyperFrames 0.8.229 es la base provisional.** No actualizarlo sin evaluar antes la compatibilidad con 0.9.46 (pasos en README → Dependencias).
- **Override de seguridad:** `undici` se fuerza a 7.30.2 solo dentro de `hyperframes`. Revisarlo en cada actualización del motor. No añadir overrides globales ni subir versiones mayores para silenciar `npm audit`.
- **No versionar** binarios pesados, renders, modelos ni secretos (ver `.gitignore`).
- **Sin rutas absolutas** en el código. Las rutas se resuelven desde `src/orchestrator/paths.js`.
- **Escenas visuales:** todo elemento se genera con código (SVG, Canvas procedural, CSS, GSAP). No se usan imágenes externas, fotografías, imágenes generadas por IA ni 3D. La geometría y la aleatoriedad llevan semilla. El movimiento sigue el contrato de HyperFrames: sin `Math.random` sin semilla, `Date.now`, `performance.now`, temporizadores ni `repeat: -1`. `hyperframes check` debe pasar sin errores antes de renderizar.
- **No versionar** `projects/*/build/`, `projects/*/build-preview/` ni `projects/*/output/` (vídeos, hojas de contacto, informes).
- **Audio:** música y efectos solo por síntesis con Tone.js, renderizada offline en Node (`node-web-audio-api`). Prohibidos los modelos generativos de música o audio, los servicios externos, Freesound y otros bancos de sonidos, y las muestras o archivos de audio de terceros. Determinismo: semillas, sin `Tone.Noise`/`Tone.Reverb` (usan `Math.random`) y sin nodos con AudioWorklet. Salida: WAV PCM a 48 kHz, 16 bits y estéreo, con fades y techo de pico. La voz TTS es un subsistema independiente (servicio Python y `audio.json → voice`).
- **Flujo de producción de escenas:** iterar con `vf preview` y renderizar con `vf render` una sola vez al final. Las tareas de escena se resuelven en `projects/<id>/`; el motor solo se amplía con piezas reutilizables (ver la Skill `video-production`, apartados A y B, y `references/catalog.md`).

## Skill portable `.claude/skills/video-production/`

- Debe poder comprimirse sola en `video-production.zip` → `video-production/{SKILL.md,references,templates,scripts}`.
- No puede contener rutas absolutas ni enlaces fuera de su carpeta. Sus scripts solo pueden usar módulos nativos de Node 22 (`node:*`). `tests/skill.test.js` lo comprueba.
- `scripts/detect-environment.mjs` es la única implementación de la detección del entorno. `vf doctor` la importa.
- No confundir la Skill con el motor: el código del motor se queda en este repositorio.

## Comandos

```bash
npm install
npx vf --version
npx vf doctor [--json] [--network]
npx vf project validate <dir> [--json]
npx vf build <proyecto> [--force]       # scene.js + timing.json → build/ (no reescribe si nada cambió)
npx vf preview <proyecto> [--at t1,t2] [--video]   # revisión rápida a 540×960 (fotogramas o MP4 borrador a 15 fps)
npx vf check <proyecto> [--force]       # hyperframes check (en caché por hash de contenido)
npx vf render <proyecto> [--quality draft|looks|delivery] [--workers n] [--force]   # render final + verificación
npx vf verify <proyecto>                # vuelve a verificar el MP4 final sin renderizar
npx vf audio render <proyecto> [--force]   # audio procedural (Tone.js offline) → mix.wav + stems, verificados
npx vf av render <proyecto> [--force]      # av.json: MP4 visual + mezcla WAV → MP4 con AAC (vídeo copiado, sin cambios de ganancia)
npm test              # pruebas unitarias (node:test)
npm run test:render   # render real con HyperFrames (requiere Chromium y FFmpeg)
```

## Entorno remoto actual (Claude Code en la nube)

Ubuntu 24.04, 4 CPU, 15 GB de RAM y **sin GPU**. La salida a Internet pasa por un proxy: `huggingface.co` y `cdn.jsdelivr.net` están bloqueados, y npm, PyPI y GitHub están permitidos. El contenedor es efímero, así que hay que hacer commit y push del trabajo. Ejecutar `npx vf doctor --network` para ver el estado actualizado.

## Rama de trabajo

`claude/videofactory-env-setup-bqn986`
