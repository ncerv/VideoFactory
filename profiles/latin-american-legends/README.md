# Perfil: Leyendas latinoamericanas

**Estado:** `awaiting-editorial-document`.

Este perfil tiene un documento editorial propio que todavía no se ha incorporado. **No se debe reconstruir, resumir ni inventar su contenido.** El documento se añadirá íntegro más adelante.

## Estructura

```
latin-american-legends/
├── profile.json     # metadatos del perfil (validado con schemas/profile.schema.json)
├── README.md
└── editorial/       # aquí irá el documento editorial completo
```

## Al incorporar el documento

1. Copiar el documento íntegro en `editorial/` sin modificarlo.
2. En `profile.json`, poner la ruta del archivo en `editorial.document` y cambiar `status` a `draft` o `active`.
3. Si el documento fija estilos, añadirlos a `artStyles` con los ids de `library/art-styles/registry.json`.
