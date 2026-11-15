# mix

`vf mix render <dir>` ejecuta `mix.json` (`schemas/audio-mix.schema.json`) y produce `output/mix/mix.wav` (PCM de 16 bits, 48 kHz y estéreo, con dither con semilla) y `mix-report.json`.

- **Pistas:**
  - `narration`: la copia de producción de `vf voice ingest`, en caché.
  - `stem`: WAV a 48 kHz y estéreo. Si está en la salida de un proyecto de audio hermano, ese proyecto se regenera antes con su caché.
  - La voz en varios archivos (`tts`) es un contrato reservado y todavía no se ejecuta.
- **Ganancias:** cada pista lleva solo su `gainDb`. No se normaliza pista a pista.
- **Ducking:**
  - `ducking.roles`, por defecto música y ambiente, se atenúan `amountDb` mientras suena la voz, con rampas de `attack` y `release`.
  - Los efectos no se atenúan salvo `"duck": true`, y una pista con `"duck": false` nunca se atenúa.
  - Dónde suena la voz se toma de los tiempos manuales de `narration.json` (`alignment: "manual"`) o, si no hay, de una detección por energía en ventanas de 20 ms (`ducking.detection`). Marca dónde hay voz, no cuándo empieza cada frase.
- **Normalización final:**
  - `linear` aplica una sola ganancia a la mezcla completa para acercarse a `integratedLufs` sin superar `truePeakDb`. El techo manda: si no se alcanza el objetivo, se avisa en lugar de comprimir o limitar.
  - `none` no normaliza y solo exige el techo.
- **Comprobaciones:**
  - formato y duración exactos, sin clipping, con el techo respetado;
  - sonoridad alcanzada o aviso;
  - la voz entra con su ganancia más la del master, medida por proyección sobre la copia de producción (no se atenúa ni se recorta: si no cabe en `duration`, falla);
  - qué pistas se atenuaron.
- **Caché:** depende de `mix.json`, `narration.json`, el SHA-256 de cada fuente, el código y FFmpeg.

Para unirla al vídeo: `av.json` con `"audio": { "project": "../<id>", "use": "multitrack" }` y `vf av render`.
