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

**Espacio para la voz:** la música vive por debajo de 300 Hz o es escasa y aguda. La banda 300–3000 Hz queda en torno a −13 dB respecto de la energía total, y el conjunto suena a unos −26 LUFS, un nivel de fondo adecuado para narración.
