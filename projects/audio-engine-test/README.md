# audio-engine-test: primera prueba del motor de audio

Composición ambiental original de **10 s**, inspirada en la escena visual `night-forest-test` (que no se modifica). Está generada solo con síntesis. No es contenido editorial.

```bash
npx vf audio render projects/audio-engine-test        # ~4 s; si nada cambió, ~0,2 s
```

Salida (no versionada) en `output/`:

- `mix.wav`
- `stems/{drone,wind,pulse,resonance,transition}.wav`
- `review.png` (forma de onda y espectrograma)
- `audio-report.json`

| Archivo | Papel |
|---|---|
| `audio.json` | Formato (48 kHz, 16 bits, estéreo), master (fade-in 1,2 s, fade-out 1,8 s, techo −1,5 dBFS), stems y voz (sin segmentos todavía) |
| `timing.json` | Tiempos y parámetros de cada capa |
| `audio.js` | Qué suena y cuándo: cinco stems con los generadores de `library/audio` y un espacio acústico común |

## Dramaturgia

| Tiempo | Acontecimiento |
|---|---|
| 0 s | Entran el drone (La1 + Mi2, filtro que respira) y el viento con ráfagas |
| 3,4 s | La nube vela la luna: empieza un pulso grave de latido (52 → 60 ppm) cada vez más intenso |
| 5,7 s | Aparecen los ojos: campana lejana en Re♯5, en tritono con el drone, a la izquierda |
| 6,4–8,7 s | Crescendo de ruido marrón que barre de 180 a 1600 Hz, como transición discreta |
| 8,2–10 s | Fade-out |

**Espacio para la voz:** la música vive por debajo de 300 Hz o es escasa y aguda. La banda 300–3000 Hz queda en torno a −14 dB respecto de la energía total, y el conjunto suena a unos −26 LUFS, un nivel de fondo adecuado para narración.

## Mezcla aprobada (referencia)

**Nivel del latido aprobado: `timing.pulse.gainDb = −11 dB`.**

En la primera escucha, con −17 dB, el latido casi no se percibía. Se compararon dos variantes: +3 dB (−14) y +6 dB (−11). El usuario aprobó la de **+6 dB** tras escucharlas. El patrón, el tempo, el crescendo y la duración del latido no cambian.

| Medida (mezcla de referencia) | Valor |
|---|---|
| Formato | PCM s16le · 48 kHz · 16 bits · estéreo · 10,000 s (480 000 muestras) |
| Pico de muestra / true peak | −9,93 dBFS / −9,9 dBTP (sin clipping) |
| Sonoridad | −25,7 LUFS integrados · LRA 4,0 LU |
| Latido respecto a la mezcla (RMS, 3,4–9,3 s) | −9,8 dB (con el nivel anterior de −17 dB era −15,4 dB) |
| Ganancia del master (techo −1,5 dBFS) | 0 dB: el techo no actúa y el resto de stems no cambia |

El render es determinista: con las mismas entradas, `mix.wav` y los stems salen idénticos byte a byte.
