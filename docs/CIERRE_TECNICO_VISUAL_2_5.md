# Cierre técnico y visual 2.5 — NOERGON

Implementación local. Sin Gemini, claves nuevas, facturación, cambios en producción ni migraciones en Supabase remoto. Se conserva la infraestructura de etapa 3 existente, deshabilitada.

## Uso y separación de vistas

1. Administración de cartera → seleccionar empresa → **Indicadores por póliza**.
2. Elegir explícitamente póliza/aseguradora, snapshots de primas y gastos, meses YYYY-MM separados por coma y coberturas de las versiones contractuales validadas. No se escoge automáticamente la última carga ni se asignan filas dudosas.
3. **Consultar indicadores** llama al endpoint mensual verificado. Muestra primas, gasto técnico, siniestralidad, efectos de gasto y prima en pp, variación relativa, conciliación, exclusiones y métricas por cobertura contractual. La base anterior se informa por separado.
4. La sección de escenarios permite introducir todos los supuestos de etapa 2, sin tasas precargadas, y calcular solo con el botón explícito. El backend vuelve a comprobar alcance, vigencia, completitud, base, conciliación y supuestos. Un botón habilitado no sustituye esa comprobación.
5. Reportes conserva su **consolidado empresarial**, identificado como agregado que puede reunir varias pólizas. No utiliza el selector de póliza ni los supuestos de la vista individual. Su base pagada/incurrida se declara no determinada porque el agregado mutable no acredita el alcance de snapshots revisados.

Los meses empresariales sin registros ya no se rellenan con cero: la API devuelve `premiumUf=null`, `spendUf=null`, `lossRatio=null`. Los ceros explícitos de origen siguen siendo cero. Gráficos y resumen ejecutivo admiten valores nulos; no se presenta la suma de meses disponibles como un total íntegro cuando faltan meses. Los clientes externos de `/report/primas`, si existen, deben admitir este contrato nullable. El frontend incluido está actualizado.

La calidad del consolidado se muestra como pendiente de validación contractual cuando hay registros, e incompleta cuando faltan. No se presume un catálogo de coberturas contratadas desde la mera presencia histórica de una etiqueta de sábana.

## Calidad por mes y cobertura

| Estado visible | Significado |
|---|---|
| Completo | Dentro del alcance seleccionado: datos presentes, sin incidencias de aislamiento, base y completitud acreditadas y conciliación suficiente |
| Incompleto | Falta una fuente o se confirmó que el archivo está incompleto; no equivale a valor cero |
| Parcial · revisar datos | Hay una vigencia/asignación aparente parcial o un error de mes registrado pendiente de corrección |
| Ambiguo · revisar datos | Póliza, empresa, aseguradora, vínculo o cobertura contractual no pueden resolverse inequívocamente |
| Pendiente de validación | Faltan acreditaciones, versión válida, conciliación o resolución manual |

Los estados corresponden a cada mes/cobertura, no certifican toda la empresa o vigencia. `complete` conserva su significado estructural previo; `completenessConfirmed`, `expenseBasis`, `qualityStatus` y `dataReviewBlocked` añaden la revisión explícita. Los consumidores de conclusiones/proyecciones verifican esos campos y no dependen solo de `complete`.

La atribución por cobertura requiere conciliación por cobertura en ambos meses, la misma base acreditada y completitud revisada. Si no se cumplen, las contribuciones son nulas y se muestra una advertencia. La descomposición matemática total del gasto técnico puede mantenerse como lectura descriptiva, sin inferir causas clínicas. No se presentan líneas de reembolso como atenciones únicas.

## Base pagada/incurrida

La base inicial es `undetermined` (No determinada). No se infiere desde el nombre de columnas, reembolsos, importes coincidentes ni desde `claimsBasis` enviado en un escenario.

Un administrador debe acreditar `paid` o `incurred` con página y cita de un documento del mismo cliente, para una póliza, versión, par de snapshots, mes y cobertura concretos. Se utiliza la última revisión de ese tipo en ese alcance. Una revisión rechazada o pendiente posterior retira la acreditación; no se reutiliza la de otra carga o versión.

La renovación se bloquea si la base es desconocida/mixta, si no coincide con el supuesto solicitado o si falta completitud acreditada. El factor de desarrollo permanece como hipótesis explícita: el sistema no reconstruye reservas/IBNR ni transforma automáticamente reembolsos pagados en siniestros incurridos. El respaldo se verifica por pertenencia y cita exacta; su suficiencia técnica y semántica requiere el juicio del revisor autorizado.

## Revisión manual, autorización e historial

La nueva migración independiente `202611050002_portfolio_technical_reviews.sql` añade una tabla append-only con RLS, vinculada a empresa, póliza, versión, snapshots, mes y cobertura. Reutiliza:

- `is_admin()` para autorizar escrituras y `can_access_client()` para lectura.
- `portfolio_check_evidence()` para comprobar documento/página/cita del cliente.
- `portfolio_capture_audit()` y `portfolio_audit` para registrar autor y evento.
- El flujo existente **Documentos y renovaciones → Primas y gastos: conciliación e historia**, mediante el botón **Revisar asignaciones y fuentes**, para corregir vínculos con `portfolio_link_row` y consultar las fuentes.

El formulario permite revisar base del gasto, completitud, errores de mes/cobertura y asignaciones. Las decisiones se agregan; no se actualizan ni borran revisiones anteriores desde usuarios funcionales. Validar base/completitud/asignaciones requiere respaldo. El historial muestra fecha, actor, fundamento y referencia/cita documental.

Para corregir una asociación a póliza/versión equivocada se incorpora **Retirar vínculo erróneo → motivo → Confirmar retiro de vínculo**. La RPC `portfolio_unlink_row` requiere administrador y motivo, comparte el bloqueo del snapshot con la asignación, y registra `UNLINK` con el vínculo anterior, motivo y actor. Retira solo la asociación: conserva filas originales, importes, documentos y versiones. Después se puede registrar un vínculo correcto por el flujo existente. No se completa automáticamente el porcentaje retirado.

Los documentos usados por revisiones validadas no pueden reasignarse ni reprocesarse destructivamente mediante la RPC existente. La migración envuelve esa RPC conservando su firma y contrato anterior; su implementación previa queda privada. Documento y validación comparten bloqueo de fila para evitar una carrera entre cita verificada y reatribución.

### Tratamiento aprobado de aparentes meses parciales y coberturas duplicadas

El usuario aclaró que no espera esos casos como situaciones contractuales normales y que, si aparecen, son errores de datos. Se implementa su señalización/revisión y **no** un prorrateo. Dos entradas Salud en una misma versión son una duplicidad por tipo que el esquema de asignaciones actual no puede separar; no se confunden con Salud + Dental ni con varios planes dentro de una cobertura.

Las revisiones `partial_month` y `coverage_ambiguity` solo pueden quedar pendientes o rechazadas/requiriendo corrección. Una nota no habilita importes ni proyecciones. Esos errores deben corregirse contra los originales mediante una nueva carga/snapshot o una versión contractual corregida y validada; las asignaciones se modifican manualmente con su auditoría existente. Las revisiones de datos abiertas bloquean el análisis del alcance afectado. No se altera la sábana para cuadrar importes.

Si más adelante aparece un caso real que requiera prorrateo o separación de dos coberturas del mismo tipo, debe presentarse la evidencia y aprobar una regla/esquema específico antes de implementarlo. No se introdujo esa regla en este cierre.

## API y compatibilidad

Se conservan `/report/policies/:policyId/monthly`, `/quality` y `/renewal-scenarios`, con los mismos parámetros de selección. Se añaden:

- `GET /report/policies/:policyId/reviews`: historial del alcance seleccionado y disponibilidad del almacenamiento.
- `POST /report/policies/:policyId/reviews`: administrador únicamente; requiere versión, período/cobertura de la selección, tipo, decisión, base, `data_complete` booleano/null, fundamento y evidencia al validar. La RPC vuelve a verificar permisos y vínculos.
- `POST /portfolio/manage/links/remove`: retiro manual de una asociación identificada, con motivo y auditoría; solo administrador.

Las lecturas de revisiones están paginadas en backend. Sin la nueva tabla, los indicadores siguen disponibles como observaciones, con base/completitud pendientes y proyecciones bloqueadas; se muestra el requisito de instalación. No se aplica la migración automáticamente. La migración requiere cartera y puede coexistir con `202611050001_analysis_persistence.sql`; la prueba de esquema carga ambas después de las nueve históricas. No se edita el consolidado generado.

## ExcelJS

Se fija **ExcelJS 4.4.0** en manifest y lockfile. No se refactoriza el adaptador estable de etapa 2. Este reutiliza `_parseWorkbook`, `_parseRels`, `_parseSharedStrings` y `_parseWorksheet` del lector de streaming, con acceso por directorio ZIP mediante unzipper.

Las regresiones cubren metadatos posteriores a hojas, primera hoja lógica distinta de la primera entrada ZIP y seis lecturas paralelas con orden ZIP no convencional. Se conserva la reproducción del fallo del lector secuencial original. Cualquier actualización de ExcelJS requiere revisar esos métodos internos y pasar esas pruebas antes de cambiar el pin.

## Archivos de este cierre

| Grupo | Archivos |
|---|---|
| Esquema y contratos | `supabase/migrations/202611050002_portfolio_technical_reviews.sql`, `shared/technicalReview.d.ts`, `shared/technical.d.ts` |
| Revisión y motores | `backend/src/technicalReview.ts`, `policyScope.ts`, `policyScopeRoute.ts`, `portfolioAdmin.ts`, `technicalIndicators.ts`, `renewalScenarios.ts` |
| Compatibilidad y caché futura | `backend/src/report.ts`, `types.ts`, `analysisPrivacy.ts` |
| Dependencia fijada | `backend/package.json`, `backend/package-lock.json` |
| Interfaz | `frontend/src/components/PolicyTechnicalPanel.tsx`, `PortfolioAdministration.tsx`, `PortfolioReconciliation.tsx`, `PrimasCharts.tsx`, `ExecutiveSummary.tsx`, `frontend/src/App.tsx`, `api.ts`, `types.ts`, `styles.css`, `lib/technicalTypes.ts`, `lib/technicalLabels.ts` |
| Pruebas backend | `backend/tests/technical-review-db.test.ts`, `helpers/technicalReviews.ts`, `technical-indicators.test.ts`, `policy-scope.test.ts`, `analysis-privacy.test.ts`, `year-comparison.test.ts`, `excel-stream-order.test.ts` |
| Pruebas visuales | `frontend/tests/technical.html`, `technicalHarness.tsx`, `technical-browser.mjs`, `browser-smoke.mjs` |
| Documentación | Este archivo |

## Verificación y límites

Resultado local final: **125/125 pruebas backend aprobadas**, TypeScript y builds de ambos proyectos correctos, prueba de navegador técnico y regresión de cartera/marca/PDF aprobadas. `git diff --check` sin errores. No se realizaron pruebas sobre datos o servicios remotos.

- Suite backend: `cd backend && npm test`, incluidos PostgreSQL/PGlite local, RLS, escritura admin, citas, empresa/snapshots incompatibles, historial/auditoría, documentos protegidos, bases desconocidas/pagadas/incurridas, meses/coberturas erróneos, conciliación y XLSX.
- Tipos y builds: backend `npm run build`; frontend `npx tsc --noEmit` y `npm run build`.
- Navegador con respuestas sintéticas: `cd frontend && node tests/technical-browser.mjs`. Comprueba selección explícita sin solicitudes al cambiar filtros, estados, nulos, base, permisos, revisión de error, escenarios solo al pulsar, invalidación visual y ninguna nueva solicitud al imprimir. Incluye el resumen empresarial con un mes ausente.
- Regresión de navegación/marca/PDF: `node tests/browser-smoke.mjs`.

Los datos históricos quedan pendientes hasta que un administrador aporte evidencia: no se inventa acreditación para mantener habilitadas proyecciones antiguas. Las pruebas usan acreditaciones sintéticas explícitas cuando necesitan escenarios válidos. No se puede verificar la suficiencia técnica de una cita de forma automática.

Esta vista individual no se incorpora al PDF empresarial existente: se mantienen alcances separados y no se modifica su selección. No se define todavía un nuevo formato de informe PDF por póliza.

## Qué queda listo para la etapa 3

La interfaz consume el motor aislado y expresa sus bloqueos; base y completitud tienen trazabilidad persistible. La infraestructura de etapa 3 ya preparada en el repositorio sigue apagada. Su preparación de datos exige ahora esas acreditaciones, y la identidad de caché incorpora revisiones sin notas/citas ni datos personales. Se incrementa a `calculation-v2` para evitar reutilizar resultados anteriores a estas reglas.

Quedan pendientes migraciones aprobadas en un entorno no productivo, revisión/corrección de datos reales y evidencia suficiente. Continúan pendientes las comprobaciones de cuota gratuita, privacidad, retención y concurrencia multisesión documentadas en etapa 3. Nada de este cierre activa Gemini o autoriza etapa 4.
