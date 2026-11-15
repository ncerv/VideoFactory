# audio

Motor de audio procedural. Genera música y efectos **solo con síntesis**: Tone.js renderizado offline en Node sobre `node-web-audio-api`. No usa modelos generativos, servicios externos ni muestras pregrabadas.

| Módulo | Papel |
|---|---|
| `runtime.js` | Carga Tone.js en Node (un `window` aislado con las clases de `node-web-audio-api`) y bloquea `Math.random` durante el render |
| `dsp.js` | Ruido con semilla (blanco, rosa, marrón), respuestas al impulso sintéticas, fades, ducking, suma, análisis y energía por bandas (FFT) |
| `wav.js` | WAV PCM sin compresión de 16 o 24 bits, con dither TPDF con semilla, y su lectura |
| `render.js` | `vf audio render`: un `Tone.Offline` por stem → ducking por voz → mezcla = Σ stems → fades y techo de pico → WAV → verificación → `output/audio-report.json`. Caché por hash de las entradas funcionales: `audio.json`, `timing.json`, el grafo de imports de la composición y del motor (generadores, DSP, WAV, PRNG, verificación; `src/orchestrator/fingerprint.js`) y las versiones de tone y node-web-audio-api. La documentación no invalida la caché |
| `verify.js` | ffprobe (formato y número exacto de muestras), clipping, techo, continua, fades, sonoridad (FFmpeg `ebur128`), bandas y auditoría de recursos externos; `review.png` (forma de onda y espectrograma) |

## Decisiones comprobadas (tone 15.1.22, node-web-audio-api 2.2.0)

- **`Tone.Offline(callback, duración, canales, frecuencia)`** renderiza sin tiempo real. Necesita los constructores en `window`, y basta un objeto aislado con las clases de `node-web-audio-api`.
- **Determinismo:**
  - Se evitan las piezas de Tone que usan `Math.random`: `Tone.Noise`, `Tone.Reverb`, `humanize`/`probability` de `ToneEvent` y los patrones aleatorios. Las sustituyen el ruido y las reverberaciones con semilla de `dsp.js`.
  - Se evitan también los nodos con AudioWorklet: `FeedbackCombFilter`, `Freeverb`, `JCReverb` y `BitCrusher`.
  - El guardián de `Math.random` hace fallar cualquier uso accidental.
  - Dos generaciones independientes producen WAV idénticos byte a byte.
- **Stems y mezcla:** cada stem se renderiza por separado, con su propia instancia del espacio acústico (misma semilla). Fades y techo se aplican igual a todos, así que Σ stems = mezcla.
- **Voz:** no se sintetiza. `audio.json → voice.segments` solo atenúa (ducking) los stems de rol `music` y `ambience` de este proyecto. La narración real se recibe con `vf voice ingest` (`src/voice`) y se mezcla con `vf mix render` (`src/mix`).
- **Integración con la imagen:** `vf av render` (`src/av`) multiplexa la mezcla con el MP4 visual sin modificarla.
- **Mezcla multipista:** `vf mix render` ejecuta `schemas/audio-mix.schema.json` (narración, stems, ducking y normalización final).

## Ajustes comprobados en producción (El Curupira, 55,333 s)

- **Duración exacta:** `Tone.Offline` trunca duración × frecuencia (55,333333 s daban 2 655 999 muestras). Cada stem se ajusta al número exacto `round(duración × frecuencia)`.
- **Auditoría de recursos:** no revisa `output/`, `build/`, `build-preview/` ni `voice/`. La narración que entrega el usuario es una entrada legítima del flujo, no una muestra de terceros.
