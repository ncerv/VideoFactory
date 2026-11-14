# audio (generadores)

Generadores de sonido reutilizables. Firma común: `generador(ctx, opciones)`. Programan en tiempos absolutos (segundos) dentro del `Tone.Offline` que prepara `src/audio/render.js`.

**Convención de nivel:** `gainDb` ≈ pico del generador aislado (±3 dB). Cada generador lleva su compensación medida y una prueba lo comprueba.

| Generador | Técnica | Uso |
|---|---|---|
| `drone` | `FatOscillator` desafinados + sub-octava, paso bajo de −24 dB/oct que respira con un LFO, envolvente lenta | Drones graves y atmosféricos |
| `wind` | Ruido coloreado con semilla → paso banda con ráfagas (recorrido aleatorio con semilla), silbido estrecho, `AutoPanner` | Viento, aire, ambiente |
| `pulse` | `MembraneSynth` con patrón (latido), intensidad creciente y aceleración | Pulsos de tensión |
| `resonance` | Síntesis aditiva de parciales inarmónicos con caídas exponenciales, batido, transitorio de golpe y control de distancia | Campanas y resonancias lejanas |
| `whoosh` | Ruido con barrido de paso banda, crescendo y paso estéreo | Transiciones y whooshes |
| `impact` | Seno con caída de tono, sub y chasquido de ruido | Impactos y golpes |
| `space` / `echo` | Convolución con respuesta al impulso sintética con semilla / `FeedbackDelay` | Espacio acústico compartido por envíos |

`ctx` contiene:

- `Tone`, `lib`, `out` (salida del stem), `duration`, `sampleRate` y `timing`;
- `rng`, el generador con semilla del stem;
- `noise(kind, segundos, semilla)` → `ToneAudioBuffer` estéreo con semilla.

Pendientes previstos: pasos, maquinaria, melodías misteriosas y bosque (pájaros e insectos sintéticos).
