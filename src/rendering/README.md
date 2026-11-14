# rendering

Generará las composiciones HyperFrames de cada escena a partir del storyboard y de `library/`, y lanzará el render con `src/adapters/hyperframes.js`. La exportación final se hará con FFmpeg.

**Estado:** el adaptador de HyperFrames ya renderiza una composición (ver `tests/integration/render.test.js`). La generación de composiciones está pendiente.

Regla: el render lo hace siempre HyperFrames. No se implementa una captura propia con Playwright.
