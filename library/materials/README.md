# materials

Texturas y tratamientos de superficie 2D.

## `vf-textures.js` (runtime de navegador)

Pinta **una sola vez**, al cargar la escena, los `<canvas data-vf-texture="…" data-vf-params='{…}'>`:

| Textura | Técnica |
|---|---|
| `sky` | Degradado vertical por paradas + resplandores radiales + velo de nubes fBm + *dithering* (evita bandas en H.264) |
| `fog` | Máscara fBm estirada con perfil vertical gaussiano; se pinta a baja resolución y el CSS la amplía |
| `grain` | Ruido gris para mezclar en `overlay` |

El ruido es de gradiente 2D con permutación sembrada (mulberry32). No usa `Math.random`, reloj ni recursos externos. `vf build` copia el archivo a `build/vendor/` y lo carga la raíz de la composición.
