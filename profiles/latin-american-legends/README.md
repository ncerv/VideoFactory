# Perfil: Leyendas latinoamericanas

**Estado:** `active`.

Documento editorial: [`editorial/guionista.md`](editorial/guionista.md). Es el documento original del usuario, **incorporado íntegro y sin cambios**. Es la fuente obligatoria de la etapa A (desarrollo editorial) del flujo de producción.

- **Integridad:** `profile.json → editorial.sha256` guarda su SHA-256 (`aa7821cb…b856`, 28 812 bytes, 373 líneas). `vf project validate` falla si el documento se modifica.
- **No se edita, resume ni reescribe.** Si el usuario entrega una versión nueva, se sustituye íntegra y se actualiza el hash.
- **Estilos (`artStyles`):** todos los del Paso 10 del documento: Noir Comic, Sumi Ink, Woodblock Print, Knitted Puppet, Códice pintado (`painted-codex`), CRT Vector, Pixel Art, 1930s Cartoon y recortes de papel (`paper-cutout`). CRT Vector está autorizado, pero su implementación visual está pendiente (`implementation: "pending"` en el registro de estilos).
- **[`editorial/registro.md`](editorial/registro.md):** registro persistente de Usados, Propuestos y Mi ritmo de voz que pide el documento. Se lee al empezar la etapa A y se actualiza durante las sesiones.
- **[`editorial/compatibilidad.md`](editorial/compatibilidad.md):** nota técnica, separada del documento.
  - El documento menciona ElevenLabs, pero el flujo vigente usa Google AI Studio a mano con el perfil `mystery-documentary`.
  - El «+12 %» es solo una referencia editorial.
  - La duración real de la voz manda; la voz no se acelera ni se recorta.

## Estructura

```
latin-american-legends/
├── profile.json     # metadatos del perfil (schemas/profile.schema.json)
├── README.md
└── editorial/
    ├── README.md
    ├── guionista.md       # documento editorial original (no modificar)
    ├── registro.md        # registro persistente (Usados, Propuestos, Mi ritmo de voz)
    └── compatibilidad.md  # nota técnica: voz y duración en el flujo vigente
```
