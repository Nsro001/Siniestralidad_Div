# Aislamiento por póliza y calidad de datos — etapa 1

Implementación local, de solo lectura. No requiere nuevas migraciones, no activa IA y no cambia los reportes históricos por empresa.

## Consulta

`GET /report/policies/:policyId/quality`

Exige token Bearer de una cuenta activa y acceso RLS a la empresa/póliza. Parámetros obligatorios:

- `premiumSnapshotId`: UUID de un snapshot de primas de esa empresa.
- `expenseSnapshotId`: UUID de un snapshot de gastos de esa empresa.
- `periods`: meses YYYY-MM separados por coma, máximo 120.
- `coverages`: Vida, Salud, Dental, Catastrófico o Consolidado S+D+C, separados por coma.

Los UUID de snapshots se obtienen del detalle existente de cartera. El consumidor elige explícitamente el par: no se supone que el último snapshot de cada tipo corresponde a la misma carga. No se mezclan snapshots, no se usa el dataset mutable actual y no se amplía la selección de meses.

## Resolución

1. La identidad empresarial proviene de la póliza y del propietario de ambos snapshots, comprobados bajo RLS. Las filas con nombre contradictorio se excluyen; si existe RUT empresarial canónico, también se comprueba contra el RUT presente en la fila de primas.
2. Las asignaciones existentes tienen prioridad: se exige versión validada efectiva para ese mes, cobertura contractual y suma de asignaciones no superior a 100%. Se aplican porcentajes a prima, gasto técnico y reembolsos, sin completar saldos pendientes.
3. Sin asignación, solo se admite un número de póliza exacto (normalización de espacios exteriores y mayúsculas), único entre **todas** las pólizas registradas de esa empresa. No se eliminan ceros iniciales. Si el número aparece en dos aseguradoras, no se escoge una por fechas o por orden de resultados. La cobertura debe ser explícita y contratada.
4. Un número ausente no se infiere aunque exista una sola póliza. Un número explícito contradictorio con la asignación se excluye. Las coberturas marcadas como inferidas requieren asignación verificada.
5. La versión validada efectiva debe ser la misma al inicio y al término del mes, con vigencia activa durante ambos límites, identidad contractual consistente y moneda UF. Un borrador no desplaza la versión validada. Meses con endosos internos, vigencia parcial, suspensión, cancelación o moneda distinta quedan pendientes: los datos mensuales no permiten prorratearlos con certeza.

La resolución es exclusivamente en memoria. No crea asignaciones, modifica contratos ni escribe resultados. La unicidad por número depende de que el catálogo empresarial esté completo; si no lo está, usar asignaciones verificadas antes de confiar en los resultados.

## Resultado y conciliación

La respuesta devuelve empresa, póliza/aseguradora, selección, snapshots y versión/vigencia por mes. Para cada cobertura:

- `premiumUf`, `technicalSpendUf` y `lossRatio` (razón, no porcentaje).
- `reimbursementUf`: suma firmada de reembolsos, incluidos ajustes negativos.
- `analyzedUf`: reembolsos positivos con las exclusiones actuales de distribución.
- `excludedNetUf`: reembolso neto menos gasto analizado; puede ser negativo.
- `differenceUf`: gasto técnico menos reembolsos netos.
- `reconciliation`: `matched`, `difference` o `unavailable` (tolerancia numérica 1e-8 UF).
- Filas resueltas, asignación parcial y ausencia de primas/gastos.

Una fuente ausente se representa como `null`, nunca como cero. No se interpreta ausencia de reembolsos como ausencia de siniestros. Una diferencia de conciliación se informa sin alterar ni cuadrar importes; `complete` describe cobertura/resolución de datos, no certifica coincidencia financiera ni completitud del archivo de origen.

`quality.issueCounts` contiene todas las incidencias; `quality.issues` muestra hasta 200 referencias de snapshot/índice de fila (base cero), causa y porcentaje pendiente. `issuesTruncated` avisa si hay más. `otherPolicyRows` registra filas identificadas como ajenas a la póliza seleccionada. No se devuelven filas médicas, RUT, prestadores ni detalles personales. Las filas pendientes pueden pertenecer a la póliza consultada: los totales resueltos no deben presentarse como totales íntegros cuando `complete=false`.

## Compatibilidad y límites

- Usa las nueve migraciones existentes: seis históricas y tres de cartera. Se verifican localmente con PGlite; no se aplican remotamente.
- Sin esquema de cartera, el endpoint informa 503; sin acceso a póliza o snapshot, 404 sin revelar otra empresa.
- Las rutas, filtros, gráficos, exportaciones y conclusiones históricas conservan su alcance por empresa. Esta etapa entrega la base API por póliza; no incorpora todavía un selector en el frontend ni transforma esos reportes en reportes por póliza.
- No acredita carga completa, fecha de ocurrencia/pago, episodios clínicos o exposición. No convierte monedas ni estima ajustes de renovación.
- Snapshots y versiones son históricos; las asignaciones pueden cambiar. No se ofrece una lectura transaccional única entre múltiples solicitudes PostgREST o páginas concurrentes.

## Validación

`cd backend && npm test` ejecuta pruebas unitarias, HTTP local y de esquema/RLS en PostgreSQL aislado (PGlite). Las pruebas HTTP requieren permiso para abrir un puerto local de loopback. `npm run build` verifica TypeScript del backend.
