# Notas de uso de HyperFrames en VideoFactory

HyperFrames convierte composiciones HTML en MP4. Renderiza los fotogramas con Chrome o Chromium y los codifica con FFmpeg. La documentación completa está en `npx hyperframes docs` y en https://hyperframes.heygen.com.

## Comandos que se usan

| Comando | Uso |
|---|---|
| `npx hyperframes doctor` | Diagnóstico propio de HyperFrames |
| `npx hyperframes lint <dir> --json` | Valida la composición |
| `npx hyperframes render -o salida.mp4` | Renderiza desde la carpeta de la composición. Con `-c archivo.html` se elige una composición concreta. |
| `npx hyperframes preview` | Abre el estudio de previsualización local |

**No se usa** `npx hyperframes publish`, porque sube el proyecto a un servicio externo.

## Formato básico

- El elemento raíz lleva `data-composition-id`, `data-start`, `data-duration`, `data-width` y `data-height`.
- Los elementos con tiempo llevan `class="clip"`, `data-start`, `data-duration` y `data-track-index`.
- Cada composición registra su línea de tiempo GSAP en pausa: `window.__timelines["<id>"] = gsap.timeline({ paused: true })`.
- Usa `fromTo` en lugar de `from`, ids únicos con prefijo de escena y raíces de escena con `inset: 0`.

Hay un ejemplo listo para usar en [../templates/composition.html](../templates/composition.html).

## GSAP local (obligatorio)

Las composiciones cargan `vendor/gsap.min.js` desde una copia local. No usan CDNs: en el entorno remoto `cdn.jsdelivr.net` está bloqueado, y un CDN hace el render no reproducible y dependiente de la red.

En el repositorio VideoFactory, el adaptador `vendorGsap(compositionDir)` copia GSAP desde `node_modules/gsap`. Fuera de él, se copia `gsap/dist/gsap.min.js` desde npm a `vendor/`.

## Fuentes

HyperFrames incluye varias familias, como Inter, Montserrat, EB Garamond o Playfair Display. Cualquier otra fuente necesita un `@font-face` que apunte a un archivo local del proyecto.

## Rendimiento sin GPU

Sin GPU, Chromium renderiza por software. Conviene trabajar a resolución reducida (por ejemplo 1280×720) durante el desarrollo y reservar la resolución final para el render definitivo.
