# audio

Motor de audio procedural. Genera música y efectos **solo con síntesis**: Tone.js renderizado offline en Node sobre `node-web-audio-api`. No usa modelos generativos, servicios externos ni muestras pregrabadas.

| Módulo | Papel |
|---|---|
| `runtime.js` | Carga Tone.js en Node (un `window` aislado con las clases de `node-web-audio-api`) y bloquea `Math.random` durante el render |
| `dsp.js` | Ruido con semilla (blanco, rosa, marrón), respuestas al impulso sintéticas, fades, ducking, suma, análisis y energía por bandas (FFT) |
| `wav.js` | WAV PCM sin compresión de 16 o 24 bits, con dither TPDF con semilla, y su lectura |
| `render.js` | `vf audio render`: un `Tone.Offline` por stem → ducking por voz → mezcla = Σ stems → fades y techo de pico → WAV → verificación → `output/audio-report.json`. Caché por hash de las entradas |
| `verify.js` | ffprobe (formato y número exacto de muestras), clipping, techo, continua, fades, sonoridad (FFmpeg `ebur128`), bandas y auditoría de recursos externos; `review.png` (forma de onda y espectrograma) |

## Decisiones comprobadas (tone 15.1.22, node-web-audio-api 2.2.0)

- **`Tone.Offline(callback, duración, canales, frecuencia)`** renderiza sin tiempo real. Necesita los constructores en `window`, y basta un objeto aislado con las clases de `node-web-audio-api`.
- **Determinismo:**
  - Se evitan las piezas de Tone que usan `Math.random`: `Tone.Noise`, `Tone.Reverb`, `humanize`/`probability` de `ToneEvent` y los patrones aleatorios. Las sustituyen el ruido y las reverberaciones con semilla de `dsp.js`.
  - Se evitan también los nodos con AudioWorklet: `FeedbackCombFilter`, `Freeverb`, `JCReverb` y `BitCrusher`.
  - El guardián de `Math.random` hace fallar cualquier uso accidental.
  - Dos generaciones independientes producen WAV idénticos byte a byte.
- **Stems y mezcla:** cada stem se renderiza por separado, con su propia instancia del espacio acústico (misma semilla). Fades y techo se aplican igual a todos, así que Σ stems = mezcla.
- **Voz:** es un subsistema independiente. `audio.json → voice.segments` atenúa (ducking) los stems de rol `music`/`ambience` sin tocar los generadores. Los WAV de voz los aportará el servicio TTS (`services/python/tts`).
- **Mezcla audiovisual futura:** el contrato está en `schemas/audio-mix.schema.json` (pistas, segmentos TTS, eventos, ducking y objetivo de sonoridad para normalizar con FFmpeg `loudnorm`).
