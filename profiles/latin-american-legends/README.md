# Perfil: Leyendas latinoamericanas

**Estado:** `active`.

Documento editorial: [`editorial/guionista.md`](editorial/guionista.md). Es el documento original del usuario, **incorporado íntegro y sin cambios**. Es la fuente obligatoria de la etapa A (desarrollo editorial) del flujo de producción.

- **Integridad:** `profile.json → editorial.sha256` guarda su SHA-256 (`aa7821cb…b856`, 28 812 bytes, 373 líneas). `vf project validate` falla si el documento se modifica.
- **No se edita, resume ni reescribe.** Si el usuario entrega una versión nueva, se sustituye íntegra y se actualiza el hash.
- **Estilos (`artStyles`):** los del Paso 10 del documento que existen en `library/art-styles/registry.json`: Noir Comic, Sumi Ink, Woodblock Print, Knitted Puppet, Códice pintado (`painted-codex`), Pixel Art, 1930s Cartoon y recortes de papel (`paper-cutout`). **CRT Vector** también aparece en el documento, pero todavía no está en el registro.

## Estructura

```
latin-american-legends/
├── profile.json     # metadatos del perfil (schemas/profile.schema.json)
├── README.md
└── editorial/
    ├── README.md
    └── guionista.md # documento editorial original (no modificar)
```
