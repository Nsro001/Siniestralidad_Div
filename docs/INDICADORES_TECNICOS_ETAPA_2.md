# Indicadores por póliza y escenarios técnicos — etapa 2

Implementación local de backend, sin IA, claves nuevas, facturación, despliegue ni migraciones remotas. Reutiliza las nueve migraciones existentes y el [alcance verificado de etapa 1](AISLAMIENTO_POLIZA_ETAPA_1.md).

## Alcance y API

Los reportes históricos son agregados **por empresa**: pueden reunir varias pólizas. Conservan filtros, diseño, gráficos y exportaciones, pero no acreditan análisis individual por póliza. Su cabecera `X-Report-Scope: company` lo declara. Ahora rechazan con HTTP 400 parámetros de póliza/aseguradora/snapshots que antes no filtraban. La antigua proyección fija de renovación se retiró: el informe conserva su sección y explica los requisitos pendientes.

Endpoints nuevos, autenticados y sujetos a RLS:

- `GET /report/policies/:policyId/monthly`: indicadores y comparación con mes calendario anterior.
- `POST /report/policies/:policyId/renewal-scenarios`: escenarios técnicos según configuración explícita.
- Se conserva `GET /report/policies/:policyId/quality`.

Los tres reciben query `premiumSnapshotId`, `expenseSnapshotId`, `periods` (YYYY-MM separados por coma) y `coverages` (tipos separados por coma). Se exige un snapshot de cada fuente de la empresa de la póliza, sin selección implícita de cargas. La cabecera es `X-Report-Scope: policy`.

La comparación consulta el mes anterior en **los mismos snapshots** aunque esté fuera de la selección. `referenceOutsideSelection` lo declara; esa referencia no se incorpora a los totales observados de renovación. No se sustituye un mes faltante por otro más antiguo. Se devuelven solamente indicadores calculados desde el alcance del servidor, no importes proporcionados por el navegador.

Los datos ambiguos o parcialmente asignados bloquean indicadores íntegros (`status: blocked`, importes agregados `null`). Los importes parciales resueltos permanecen identificados en `scope`, para diagnóstico. La unicidad del número depende del catálogo empresarial completo; asignaciones verificadas tienen prioridad. No se crean asignaciones automáticamente.

Se exige una versión contractual efectiva durante todo el mes. Se bloquean vigencias parciales, endosos internos y tipos duplicados de cobertura contractual: el esquema de asignaciones por tipo no permite separar dos coberturas Salud distintas de un mismo contrato. Cambios entre vigencias o identidades de cobertura bloquean la comparación, conservando indicadores individuales válidos.

## Indicadores y unidades

- Prima y gasto técnico: suma de la sábana de primas aislada, en UF.
- Siniestralidad: `G / P`, expresada como razón (`1.25` equivale a `125%`). Prima no positiva: `null`.
- Cambio absoluto: actual menos anterior. Cambio relativo: diferencia / anterior × 100, solo si la base es positiva. Base cero: diferencia absoluta disponible y porcentaje `null`.
- Por cobertura contractual: tipo, ID/nombre, gasto actual/anterior, diferencia UF, variación %, participación en el gasto técnico de las **coberturas seleccionadas** y contribuciones en puntos porcentuales.
- No se usa `Clasif.Cob` como cobertura contractual. Las líneas/asignaciones de reembolso no son atenciones únicas ni siniestros.

Descomposición exacta, sin redondear internamente, con `0` mes anterior y `1` mes actual:

```text
Δ siniestralidad (pp) = 100 × (G1/P1 − G0/P0)
Efecto gasto (pp)     = 100 × (G1 − G0)/P0
Efecto prima (pp)     = 100 × G1 × (1/P1 − 1/P0)
```

Se cambia primero el gasto, manteniendo la prima anterior; después se cambia la prima con el gasto actual. El orden está declarado porque otras descomposiciones pueden repartir de otra manera el efecto conjunto. Por cobertura se aplica la misma identidad con su gasto; las contribuciones suman el efecto total. `decompositionResidualPp` permite verificar el error numérico de punto flotante. La variación relativa de siniestralidad se devuelve separada de su diferencia en pp.

## Conciliación y bloqueos

Se mantienen por mes/cobertura gasto técnico, reembolso neto firmado, gasto analizado positivo, exclusiones/ajustes y diferencia entre fuentes. La ausencia de gastos no implica cero. La falta de detalle no impide mostrar prima/gasto técnico inequívocos, pero bloquea atribuciones.

La atribución por cobertura requiere datos completos y conciliación **en cada cobertura y ambos meses**, con tolerancia numérica de 1e-8 UF. Compensar diferencias entre coberturas no basta. Sin conciliación se conservan las diferencias contables y la descomposición total del gasto técnico, pero las contribuciones de coberturas se devuelven `null`. Es una descomposición matemática; no acredita causas clínicas.

Las exclusiones se advierten también por conteo, aunque los importes positivos y negativos se compensen en neto. Las participaciones no se presentan si el total no es positivo o existen gastos técnicos negativos. Un porcentaje o comparación no calculable se acompaña de motivo, nunca se reemplaza por cero.

## Escenarios de renovación

Body de ejemplo **sintético**, sin valores por defecto en el motor:

```json
{
  "scenarios": [{
    "name": "Ejemplo de prueba",
    "version": "ejemplo-1",
    "source": "Supuestos sintéticos para verificar las fórmulas",
    "claimsBasis": "paid",
    "dataCompletenessConfirmed": true,
    "targetLossRatio": 0.8,
    "targetIncludesExpenses": true,
    "annualClaimTrend": 0,
    "trendYears": 1,
    "developmentFactor": 1,
    "exposureFactor": 1,
    "forecastMonths": 12,
    "minimumObservedMonths": 2,
    "maintenanceBand": 0.01
  }]
}
```

Todos los campos son obligatorios. Tasas/banda son razones decimales; tendencia mayor que −1, objetivo mayor que 0 y hasta 1, factores positivos, años de tendencia no negativos y meses enteros positivos (máximo 120). Máximo diez escenarios. No hay hipótesis implícita de inflación, tendencia, desarrollo, exposición, equilibrio o descuento. Fuente y versión permiten revisar los supuestos utilizados; no equivalen a aprobación actuarial.

El objetivo debe incorporar la base de gastos/comisiones relevante (`targetIncludesExpenses`), por lo que no se cargan nuevamente comisiones o gastos al numerador. La base pagada/incurrida y el desarrollo son declarados explícitamente; la sábana no permite verificarlos automáticamente. `dataCompletenessConfirmed` es una declaración del solicitante, no una certificación del sistema.

Se requiere observación mensual continua desde el inicio contractual, de una misma vigencia, todas las coberturas contratadas, primas positivas, fuentes completas y conciliadas, importes válidos y mínimo de meses configurado. Si falta información o un supuesto, cada escenario devuelve `status: blocked`, motivos y `result: null`.

```text
G proyectado = G observado / meses observados × meses futuros
               × factor desarrollo × factor exposición
               × (1 + tendencia anual)^años de tendencia
P comparable = P observada / meses observados × meses futuros × factor exposición
P requerida  = G proyectado / siniestralidad objetivo
Ajuste (%)   = (P requerida / P comparable − 1) × 100
```

El escenario es de alza, mantención o descuento según el ajuste y la banda explícita; se conserva el ajuste calculado aun dentro de la banda. Se devuelven observaciones, supuestos, fórmulas y resultados intermedios. Es una anualización/proyección determinista: no modela estacionalidad, credibilidad actuarial, nuevas condiciones ni ofertas de aseguradoras.

## Ejemplos verificables de las pruebas

1. Mes anterior: P=100 UF, G=80 UF. Actual: P=80 UF, G=100 UF. Siniestralidad: 80% → 125%; cambio **45 pp**, variación relativa **56,25%**. Gasto aporta **20 pp** y prima **25 pp**.
2. Salud: 60 → 75 UF; Dental: 20 → 25 UF. Participaciones actuales: 75% y 25%. Salud aporta 15 pp de gasto + 18,75 pp de prima = 33,75 pp; Dental, 5 + 6,25 = 11,25 pp. Total: 45 pp, solo con conciliación suficiente.
3. Dos meses observados: P=180 UF y G=180 UF. Con el body sintético anterior: P comparable=1.080 UF, G proyectado=1.080 UF, P requerida=1.350 UF y ajuste técnico=25%. Cambiando únicamente tendencia a −20% o −40%, para verificar fórmulas con los demás supuestos idénticos, se obtienen 0% o −25%. Son ejemplos matemáticos, no supuestos recomendados ni propuestas comerciales.

## ExcelJS

Se reproduce el `TypeError` de `model.sheets` en ExcelJS 4.4 mediante un XLSX válido con relaciones/strings/hoja anteriores a `workbook.xml`. La primera corrección basada en diferir hojas no fue suficiente bajo la suite paralela. La solución final lee el directorio ZIP, procesa metadatos primero y abre cada hoja como stream según el orden lógico del libro. También prueba una hoja auxiliar que aparece primero en el ZIP.

`unzipper` 0.10.14 ya estaba instalado y fijado transitivamente; ahora es dependencia directa con la misma versión, sin descargar ni actualizar paquetes. No se modificó `node_modules`. El adaptador reutiliza métodos internos de ExcelJS 4.4: al actualizar esa biblioteca hay que revisar el adaptador y sus pruebas de orden, exportación y streaming. No se cambian los formatos CSV/XLS ni se carga toda la matriz de celdas como fallback.

## Límites pendientes

- Sin selector ni integración visual de los nuevos indicadores/escenarios en esta etapa. El diseño existente permanece.
- No hay prueba de completitud de origen, eventos clínicos únicos, exposición observada fiable ni base pagada/incurrida verificable automáticamente.
- Las consultas PostgREST de asignaciones no ofrecen una transacción común entre páginas; se conserva la limitación documentada en etapa 1.
- No se transforma moneda ni se distribuyen movimientos mensuales sobre cambios contractuales dentro del mes.
- No se modifican los SQL históricos ni el consolidado generado; las pruebas de esquema son locales con PGlite.
