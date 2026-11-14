# night-forest-test: primera prueba del motor visual 2D

Escena original de un bosque nocturno: **10 s, 1080×1920 (vertical), 30 fps, 300 fotogramas**. Todo lo visible se genera con código: SVG, Canvas procedural, CSS y GSAP. La compone y renderiza HyperFrames y la codifica FFmpeg. No usa imágenes, fotografías, modelos generativos ni 3D. No es contenido editorial.

## Reproducir

```bash
npx vf preview projects/night-forest-test  # revisión rápida: instantes de timing.json → preview.at, a 540×960
npx vf render projects/night-forest-test   # final: check + render + verificación + hoja de contacto
```

Salida (no versionada) en `output/`:

- `night-forest-test.mp4`
- `contact-sheet.jpg`: 12 fotogramas repartidos entre 0 s y 9,967 s, rotulados con tiempo y número de fotograma.
- `render-report.json`: datos de ffprobe, continuidad, auditoría de recursos, resultado de `hyperframes check` y tiempos.

## Archivos

| Archivo | Papel |
|---|---|
| `project.json` | Manifiesto: salida 1080×1920 a 30 fps, motor HyperFrames, solo 2D, módulo de escena |
| `timing.json` | **Configuración temporal**: duración, semilla, cámara, deriva de niebla, ciclos de luz, aparición de los ojos, grano |
| `scene.js` | **Composición**: paleta, capas de profundidad y especificaciones de movimiento |
| `storyboard.json` | Descripción del plano |

## Construcción

Son 19 capas apiladas de fondo a primer plano. Cada capa con profundidad (`depth`, de 0 a 1) se mueve con la cámara 2D:

| # | Capa | Técnica | Profundidad |
|---|---|---|---|
| 1 | Cielo | Canvas: degradado por paradas, resplandores radiales, velo de nubes fBm y *dithering* contra las bandas de H.264 | 0,02 |
| 2 | Estrellas | SVG en 3 grupos que centellean desfasados | 0,03 |
| 3 | Luna | SVG: disco con degradado radial, mares con `feTurbulence` + `feColorMatrix` recortados al disco y halo | 0,06 |
| 4 | Nube | Canvas fBm estirado que cruza la luna | 0,05 |
| 5 | Cresta lejana | Coníferas procedurales diminutas | 0,12 |
| 6 | Niebla lejana | Canvas fBm a baja resolución, ampliado | 0,16 |
| 7 | Bosque lejano | Coníferas + franja de bruma | 0,25 |
| 8 | Bosque intermedio | Coníferas con un claro sobre el sendero | 0,36 |
| 9 | Suelo y sendero | Polígono en perspectiva con borde irregular, franja de luz central, sombra interior, piedras y matas | 0,55 |
| 10 | Haces de luna | Polígonos con degradado longitudinal y máscara transversal (sin desenfoque), en modo `screen` | 0,58 |
| 11 | Motas de polvo | Partículas HTML dentro del haz principal | 0,60 |
| 12 | Árboles medianos y ojos | Coníferas grandes a ambos lados y ojos en la oscuridad | 0,62 |
| 13 | Niebla intermedia | Canvas fBm | 0,68 |
| 14 | Luciérnagas | Partículas HTML con degradado radial cálido, escaladas por perspectiva | 0,72 |
| 15 | Árboles desnudos | Ramificación recursiva con contornos suavizados que enmarcan los laterales | 0,86 |
| 16 | Niebla rasante | Canvas fBm | 0,90 |
| 17 | Primer plano | Hierba y frondas de helecho en silueta | 1,00 |
| 18 | Viñeta | Degradado radial CSS | Pantalla |
| 19 | Grano | Canvas de ruido en modo `overlay` | Pantalla |

**Paleta:** noche fría de bruma verde azulada. Hay un único acento cálido (`#ffc56b`), reservado a las luciérnagas y a los ojos.

## Movimiento

Los tiempos están en `timing.json` y los aplica `library/motion/vf-motion.js`:

- **Cámara 2D:** avance hacia el punto de fuga del sendero (548, 1140) de 0 a 10 s con `sine.inOut`. La escala de cada capa crece con su profundidad (empuje 0,11 en primer plano) y hay un leve desplazamiento lateral. El desplazamiento se limita al margen que gana la escala, así que ningún borde de capa entra en cuadro.
- **Niebla:** cuatro bancos que derivan a distinta velocidad y en direcciones alternas.
- **Luz:** el halo y los haces respiran en ciclos de 5,2 s y 3,6 s. Una nube cruza la luna y atenúa la luz al 50 % entre 3,4 s y 7,8 s.
- **Vida ambiental:** las luciérnagas deambulan y parpadean con semilla; las motas caen dentro del haz; los helechos se balancean, cada uno con su fase; las estrellas centellean.
- **Momento narrativo:** unos ojos aparecen entre los árboles a los 5,7 s, parpadean a los 6,7 s y a los 7,95 s, y se desvanecen a los 8,7 s.
- **Grano:** vibra a 12 fps con posiciones sembradas.

Todo es una función del tiempo de la línea: no hay `Math.random` sin semilla, temporizadores ni repeticiones infinitas.
