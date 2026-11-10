# NOERGON — Contratos sin primas totales y aislamiento de reportería

## Auditoría previa al cambio — 10 de noviembre de 2026

La búsqueda de dependencias se realizó antes de modificar el código funcional de este ajuste.

- `PolicyContract.premium` se usa en el formulario contractual, incorporación de candidatos PDF, lista de evidencias pendientes y validador del contrato. La RPC histórica exige una clave `premium` de tipo string; admite `""` y no exige evidencia si está vacía.
- Los motores y reportes no consumen `PolicyContract.premium`. `report.ts`, `monthly.ts`, `conclusion.ts`, `expenseExport.ts`, `policyScope.ts` y `technicalIndicators.ts` toman las primas de `PremiumRow.premiumUf`/snapshots. Las propiedades locales llamadas `premium` en conclusiones y comparaciones son acumulados de esas fuentes, no el campo contractual. No se deben eliminar.
- `shared/types.ts` contiene un `ColumnMapping.premium` para importación de sábanas; es otra dependencia y permanece intacta.
- Los reportes por póliza sí consumen otras propiedades del contrato (identidad, cobertura, vigencia, moneda y estado). No se eliminan ni se reemplazan esos contratos en los repositorios técnicos.
- El historial y los originales pueden contener totales. Se conservarán sin reescritura. La vista y las nuevas versiones funcionales omitirán el total. La compatibilidad RPC enviará únicamente un placeholder vacío, aislado del modelo funcional.

Se capturó antes del cambio `backend/tests/fixtures/reporting-before-no-contract-premium.json`, mediante `reportingContractIsolation.mjs --capture`. Contiene resultados sintéticos para 20 combinaciones de empresa/cobertura/período, indicadores y alcance por póliza, datos de Excel y hashes de los archivos protegidos. La prueba de navegador genera además el PDF sintético previo para comparación. Ningún dato real está incluido en estas referencias.

## Regla implementada

El modelo funcional `PolicyContract` ya no tiene `premium`. No hay input, candidato de extracción, evidencia de total ni requisito de revisión asociado a ese campo. También se retira la marca de subtotal del esquema funcional de tarifas.

Una política compartida y exclusiva del módulo contractual aplica la exclusión en la extracción, lectura administrativa, carga de históricos en el editor, importación al borrador y validación previa a escritura. Utiliza una lista permitida de propiedades: no arrastra un total heredado ni propiedades adicionales como `totalPremium`. Excluye filas de total/subtotal incluso si eran subtotales por titular o por familia y aunque tengan componentes neto/IVA/bruto. No confunde “Invalidez Total y Permanente” con una suma de primas.

Se mantienen las primas individuales declaradas por categoría/persona/familia/plan, sus componentes correspondientes y las tasas y capitales de Vida. Los componentes de una tabla sin base individual/categoría declarada no se reclasifican como primas individuales. La regla no crea cálculos, estimaciones, nóminas ni movimientos técnicos.

Los contratos históricos y la auditoría guardados en la base no se reescriben. La lectura administrativa y la preparación de una nueva versión omiten el campo y las filas prohibidas, sin mutar el objeto histórico. Los originales, el texto de las páginas y su representación documental se conservan para consultar la evidencia; un total visible en el PDF no se convierte en una fila funcional de tarificación.

## Compatibilidad con RPC

La API valida y depura primero el contrato funcional. Solo al llamar a `portfolio_save_policy` añade `premium: ""`, porque la RPC histórica exige que esa clave exista como texto. Nunca transmite un importe ni su evidencia. La respuesta funcional y el editor no exponen ese placeholder como campo del contrato.

No se modifican las RPC ni migraciones históricas y no se ejecuta SQL remoto. La garantía nueva se aplica en los límites del módulo (API, editor e importador); el protocolo histórico de Supabase permanece compatible. No se elimina ni reinterpreta ninguna prima registrada en sábanas o movimientos reales.

## Aislamiento y comparación antes/después

Se ejecuta `backend/tests/reportingContractIsolation.mjs` contra la captura generada antes del primer cambio funcional. Para exactamente los mismos datos y filtros se comparan por igualdad completa:

- 20 combinaciones de dos empresas, cinco coberturas/selecciones y dos selecciones de período.
- Reportes de primas, gastos y conclusiones; detalle mensual, filtros y evolución de asegurados.
- Alcance e indicadores por póliza y salida del motor de escenarios para el fixture.
- Todas las celdas, fórmulas, filas, columnas, estilos, combinaciones y configuración de página de la exportación Excel del fixture.
- Hashes de fuentes de motores, repositorios técnicos, endpoints y renderizadores protegidos: sin cambios.

Excel se compara semánticamente, incluyendo formato; se excluyen metadatos volátiles del contenedor ZIP/fecha de creación. No se ha cambiado el generador ni su fuente.

El navegador genera el mismo PDF sintético antes y después. Los dos PDF son binariamente idénticos después de normalizar únicamente fechas de creación/modificación e identificadores del documento. Sus dos páginas renderizadas a 72 dpi producen PNG idénticos byte por byte. Se guardan las huellas y resultados en `validation/noergon-reporting-no-totals.json`.

Estas comprobaciones acreditan los fixtures y alcances indicados; no constituyen una enumeración de todos los datos posibles en producción. La reportería y sus fuentes no recibieron cambios de código. No se usó el proyecto Supabase remoto.

## Regresiones específicas

Se verifica que:

1. Un PDF con total explícito no genera un candidato de prima total.
2. Totales, subtotales, sumas individuales y componentes agregados no se importan.
3. Un contrato recibido de un cliente antiguo con un importe `premium` se depura antes de escribir; la RPC recibe exclusivamente cadena vacía.
4. Evidencia y propiedades alternativas de total no pasan al contrato nuevo.
5. Históricos conservan su contenido original y pueden abrirse/preparar nuevas versiones sin el campo.
6. La interfaz no muestra el input y el navegador no envía `premium` ni un subtotal histórico inyectado en su fixture.
7. Los indicadores siguen usando las primas reales, independientemente de tarifas o campos de total presentes en un objeto histórico.
8. Neto, IVA y bruto solo se conservan para tarifas declaradas individuales o por categoría/plan.

La suite completa incluye las regresiones anteriores de seguridad/RLS, motores, PDF, Excel y aislamiento. Se mantienen las validaciones del resto del contrato y las condiciones pendientes/contradictorias.

## Archivos intervenidos

- `shared/contractPolicy.mjs` y su declaración de tipos: política funcional común de exclusión y lista permitida.
- `shared/portfolio.d.ts`: eliminación del campo y de la marca de subtotal.
- `backend/src/contracts.ts`, `portfolioAdmin.ts`: depuración y adaptación RPC.
- `backend/src/policyPdf.ts`, `policyConditions.ts`, `policyTariffs.ts`, `policyInterpretation.ts`: exclusión de extracción y propuestas.
- Componentes y helper del módulo contractual: retiro del campo, limpieza al leer/importar y edición de tarifas permitidas.
- Pruebas de contratos, tarifas y navegador; prueba de no incorporación de totales; captura previa y comparación de reportería.
- Evaluador de tarifas: ahora verifica la exclusión de los subtotales del conjunto de referencia, en lugar de exigir su extracción.

Los documentos anteriores se conservan como registros históricos y se marcan con el enlace a esta regla definitiva. El workspace contiene otros cambios anteriores: no se atribuyen a esta intervención.

## Resultado final

- 182 pruebas backend correctas, TypeScript y builds frontend/backend correctos; navegador aprobado.
- Comparación contra la captura previa: reportes/indicadores y Excel semántico idénticos; fuentes protegidas sin cambios.
- PDF previo/posterior normalizados idénticos y sus dos páginas rasterizadas idénticas; el comparador reproducible es `scripts/compare_reporting_pdf.py`.
- Referencias reales: los 3 subtotales antes anotados se excluyen y los 62 campos permitidos de la muestra conservan valores, moneda, frecuencia y unidad. Es una muestra dirigida, no precisión global.
- Sin migraciones remotas, despliegues ni activación de Gemini.

Los PDF guardados para esta comparación en `validation/noergon-report-before-no-totals.pdf` y `validation/noergon-report-after-no-totals.pdf` son reportes sintéticos de la aplicación, no documentos del usuario. Los datos contractuales reales siguen fuera de Git.
