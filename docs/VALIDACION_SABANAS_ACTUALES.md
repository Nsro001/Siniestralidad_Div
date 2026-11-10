# Validación de formatos suministrados — 30 de octubre de 2026

Se leyeron los dos archivos originales indicados por el usuario y se verificó su publicación mediante las RPC reales de importación en PostgreSQL aislado en memoria. No se modificaron los archivos originales ni se escribieron datos en Supabase.

| Archivo | Filas | Clientes | Períodos |
| --- | ---: | ---: | --- |
| Sabana de primas 3.xlsx | 144 | 3 | 2023-11 a 2025-10 (24 meses) |
| Sabana_de_Gastos3_depurada.csv | 28.456 | 4 | 2023-06 a 2026-06 (37 meses) |

- Primas: se unen `Rut Cliente` y `DV`; los 144 registros producen RUT con DV válido, incluidos los identificadores cortos de prueba. Se conservan KAM, jefe, póliza, titulares/cargas e importes.
- Gastos: CSV UTF-8 separado por punto y coma, con 62 columnas y encabezados repetidos/espaciados. Se conservan póliza y prestación; los períodos YYYYMM se convierten a YYYY-MM antes de publicar. No se interpretan como años de seis dígitos.
- La simulación SQL conserva las 144 primas, los 28.456 gastos y cuatro identidades de clientes. Hay un cliente con gastos sin primas: sus gastos quedan consultables sin inventar primas ni vigencia.
- 3.390 filas tienen planes `RECHAZADO` o `NO INFORMADO`. Se conserva la clasificación histórica de Salud y se añade una marca de revisión, aviso de carga y plan original en la descarga Excel. No se derivan condiciones contractuales desde esas etiquetas.
- Totales de primas y reembolsos verificados localmente, sin modificar importes ni publicar los valores de los archivos suministrados. Los meses de gastos fuera del rango de primas permanecen disponibles; no se recortan para forzar coincidencia.
- Las sábanas no acreditan fechas de vigencia contractual: esas fechas se registran y validan desde las pólizas.

El logo `frontend/public/noergon-brand.png` es una copia exacta del PNG suministrado (2172 × 724), sin edición ni recorte. La marca está presente en la vista de reportes, portada, diapositivas y PDF. Se conservan los logos configurables de clientes/corredoras junto a NOERGON. La comprobación de navegador incluye un PDF de dos páginas con los logos personalizados presentes.

Validación reproducible: `backend/scripts/validate-current-inputs.mjs`, descrita en `docs/PASO_A_PASO_LOCAL_Y_PUBLICACION.md`. Los datos de origen permanecen fuera del repositorio.

Resultado final: 63 pruebas aprobadas, TypeScript y builds de ambos proyectos correctos; comprobación de marca en navegador/PDF aprobada. Los ajustes de formatos y logo no añaden migraciones SQL; el módulo sigue utilizando el consolidado ya entregado.
