# art-styles

`registry.json` es el registro oficial de estilos y se valida con `schemas/art-style-registry.schema.json`. Por ahora todos los estilos están en estado `registered`.

- `implementation: "pending"` marca un estilo autorizado que todavía no tiene componentes procedurales funcionales y probados. `vf project validate` avisa si un proyecto lo usa.
- **CRT Vector** (`crt-vector`) está autorizado porque aparece en el Paso 10 del documento editorial de `latin-american-legends`, para «Misterios urbanos o lost media». Su implementación visual está pendiente.

Las guías de cada estilo (paleta, trazos, texturas, ejemplos) irán en `art-styles/<id>/`.
