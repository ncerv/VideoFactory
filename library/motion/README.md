# motion

## `vf-motion.js` (runtime de navegador)

Convierte especificaciones declarativas (JSON generado desde `scene.js` y `timing.json`) en tweens GSAP colocados en tiempos absolutos, conforme al contrato de HyperFrames:

- Todo valor depende solo del tiempo.
- La aleatoriedad usa semilla.
- No hay `repeat: -1`: los ciclos se despliegan en tweens explícitos.
- Los estados iniciales se fijan con `fromTo`.

| Patrón | Para qué |
|---|---|
| `camera` | Cámara 2D por parallax: escala y desplazamiento por profundidad alrededor de un punto de fuga, sin exponer bordes |
| `drift` | Desplazamiento lineal (niebla, nubes) |
| `oscillate` | Oscilación suave de una propiedad (luz, centelleo) |
| `sway` | Balanceo individual con amplitud, ciclo y fase sembrados (vegetación) |
| `wander` | Recorridos orgánicos y parpadeo (luciérnagas, motas) |
| `jitter` | Vibración por pasos a cadencia fija (grano de película) |
| `sequence` | Fotogramas clave explícitos (apariciones, parpadeos) |
