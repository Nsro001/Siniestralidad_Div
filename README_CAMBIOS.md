# Patch de mejora - Siniestralidad_Div

Incluye:
- Resumen ejecutivo inicial por cobertura.
- Consolidado Salud + Dental + Catastrófico.
- Prima UF, gasto UF y siniestralidad totalizada.
- Conteo de titulares y cargas con uso/siniestro desde la sábana de gastos.
- Presets de período: Vigencia actual, Últimos 12 meses, Todo y Personalizado.
- Corrección de textos con caracteres UTF-8 mal codificados en App.tsx.

## Archivos a reemplazar/agregar
- backend/src/types.ts
- backend/src/parser.ts
- backend/src/index.ts
- frontend/src/api.ts
- frontend/src/types.ts
- frontend/src/App.tsx
- frontend/src/components/ExecutiveSummary.tsx (nuevo)

## Importante
La sábana de gastos sólo contiene personas que tuvieron movimientos/siniestros. Por eso los KPIs se llaman "Titulares con uso" y "Cargas con uso". Para total de asegurados vigentes se necesita una nómina/censo de asegurados.

## Datos de prueba adjuntos (INTERANDINA, nov-2024 a oct-2025)
- Salud: Prima UF 1.527,35 | Gasto UF 1.401,47 | Siniestralidad 91,8%
- Dental: Prima UF 149,37 | Gasto UF 150,77 | Siniestralidad 100,9%
- Consolidado S+D+C: Prima UF 1.676,72 | Gasto UF 1.552,24 | Siniestralidad 92,6%
- Titulares con uso: 88
- Cargas con uso: 80
