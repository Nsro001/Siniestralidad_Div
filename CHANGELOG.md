
## 2026-09-05
- Se agregó resumen ejecutivo inicial.
- Se agregó consolidado Salud + Dental + Catastrófico.
- Se agregó conteo de titulares con uso y cargas con uso.
- Se agregaron filtros:
  - Vigencia actual
  - Últimos 12 meses
  - Todo
  - Personalizado
- Se agregó soporte de período corto para reportes.
- Pendiente:
  - rediseño del resumen ejecutivo en PDF con 3 indicadores circulares.
  - tabla compacta de titulares y cargas.
  - optimización visual A4.

## 2026-09-05 — Rediseño del resumen ejecutivo
- Tres indicadores circulares: Consolidado S+D+C, Salud y Dental, con porcentaje dentro y cobertura/período corto debajo.
- Tabla compacta de titulares y cargas con uso; se conserva el número de períodos y la nota sobre la necesidad de un censo.
- Se conserva la tabla de Prima UF, Gasto UF y Siniestralidad y sus cálculos.
- Estilos de impresión A4 con márgenes de 12 mm, círculos en tres columnas y tabla sin ancho mínimo en impresión.
- Validación: build de frontend correcto; TypeScript correcto con --types vite/client; renderizado estático verificado con datos de ejemplo, períodos desordenados y datos ausentes.
- El chequeo TypeScript sin --types vite/client detecta la declaración faltante de ImportMeta.env en api.ts, ajena a este cambio.
- Pendiente: revisión visual del PDF con datos reales y optimización A4 del resto de los reportes.
