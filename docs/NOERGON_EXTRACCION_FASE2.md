# NOERGON — Extracción contractual, fase 2

> Regla vigente: [Contratos sin primas totales](NOERGON_CONTRATOS_SIN_TOTALES.md). Las descripciones de prima total opcional y subtotales de este informe corresponden a una implementación anterior y quedan reemplazadas.

Entrega local del 10 de noviembre de 2026. Se amplía el módulo existente; no se rediseñan sus cinco pestañas ni se modifican los motores de siniestralidad. Sin migraciones remotas, despliegues, proveedores externos ni activación de Gemini.

## Diagnóstico y cambio

La fase 1 preservaba texto, filas separadas por espacios y candidatos generales. No representaba columnas, celdas combinadas ni la relación prestación–campo–plan. Un porcentaje detectado en una página no era todavía una condición lista para el contrato.

Ahora se usa Poppler para obtener palabras y coordenadas; un renderizado local gris permite reconstruir bordes, celdas y combinaciones verticales/horizontales. Para páginas OCR se obtienen coordenadas TSV de Tesseract, sin eludir las restricciones del lector. Se conserva además una vista del texto tabular para revisar zonas sin cuadrícula reconocida. Las celdas vacías permanecen vacías: no se rellenan con cero ni con valores adyacentes.

Los encabezados asignan el tipo de campo, la unidad y el período. Se generan condiciones por cobertura, plan, grupo y prestación, con página, cita literal, región normalizada, tabla/celda de origen, notas y alternativas. Los límites compartidos conservan su celda de origen y una advertencia; no se convierten en límites individuales independientes. Los rubros y modalidades distinguen prestaciones homónimas y convenio/libre elección.

Los títulos y tablas contractuales permiten proponer beneficios. Las referencias generales, exclusiones y anexos administrativos quedan separadas y no se importan como beneficios. Las condiciones narrativas se conservan completas para revisión, sin convertir automáticamente todas sus excepciones en campos numéricos.

## Revisión y persistencia

La pestaña Documentos incorpora una tabla editable de condiciones, filtrable por cobertura y plan. Permite corregir asociaciones, grupos, valores, unidades, ámbitos y períodos. El botón de evidencia renderiza la página original y resalta la región del valor; conserva también la cita literal. El original privado se puede abrir por separado.

“Incorporar condiciones al borrador” crea planes y condiciones sin transcribirlos. Se conservan los identificadores de origen para que repetir la importación no duplique ni sobrescriba correcciones. Se guardan los grupos específicos de cada condición, además de los grupos del plan. Un conflicto con otro documento/borrador conserva ambos valores y exige revisión.

Las filas ambiguas se incorporan como pendientes. Se pueden resolver en la tabla antes de importar o en el formulario de condiciones del contrato. La API permite guardar borradores, pero impide confirmar condiciones pendientes o valores contradictorios del mismo alcance, aunque se hayan marcado ambas alternativas como revisadas. Las correcciones y sus fuentes quedan en las versiones/auditoría existentes. No se cambian los cálculos técnicos.

La vista de página exige sesión y lectura del documento mediante el cliente Supabase del usuario; no usa service role. Verifica la huella del original antes de renderizar. Devuelve una imagen efímera con `Cache-Control: no-store`. La contraseña se pasa solo durante la operación. Se conserva el límite de concurrencia compartido con el extractor y la limpieza de temporales. Se añaden límites de raster, complejidad de cuadrícula y 16 MiB para la representación estructurada.

## Antes y después en los tres documentos

| Caso | Páginas | Tablas con cuadrícula | Páginas con respaldo de texto tabular | Condiciones propuestas |
|---|---:|---:|---:|---:|
| Consorcio | 52 | 15 | 11 | 136 |
| Vida Cámara Vida | 14 | 5 | 3 | 35 |
| Vida Cámara Salud | 26 | 14 | 10 | 166 |

Los recuentos de condiciones incluyen beneficios, restricciones y referencias para revisar; no son 337 condiciones confirmadas. Los recuentos de cuadrículas incluyen tablas auxiliares y parciales, no solo tablas de beneficios completas.

Antes no había objetos prestación–campo–plan en este esquema. Después hay propuestas estructuradas e importables con evidencia y advertencias. Esta comparación mide capacidad estructural; no significa que la fase 1 fuera incapaz de localizar números en el texto.

## Evaluación por valor de campo

Se transcribieron manualmente **57 condiciones de siete páginas renderizadas de los originales**: 11 de Consorcio, 20 de Vida Cámara Vida y 26 de Vida Cámara Salud. El archivo de anotaciones se creó por lectura visual, no desde las predicciones. Es una muestra dirigida usada durante el desarrollo, sin un segundo anotador ni conjunto ciego separado.

| Campo evaluado | Casos | Valores correctos | Incorrectos / ausentes / ambiguos en la muestra | Precisión de valores emitidos en los campos anotados |
|---|---:|---:|---:|---:|
| Capital | 4 | 4 | 0 / 0 / 0 | 100 % |
| Tasa | 4 | 4 | 0 / 0 / 0 | 100 % |
| Edad de ingreso/permanencia | 12 | 12 | 0 / 0 / 0 | 100 % |
| Reembolso | 16 | 16 | 0 / 0 / 0 | 100 % |
| Tope | 15 | 15 | 0 / 0 / 0 | 100 % |
| Deducible | 5 | 5 | 0 / 0 / 0 | 100 % |
| Carencia | 1 | 1 | 0 / 0 / 0 | 100 % |

Las unidades y los períodos comprobados también coinciden en estos 57 casos. La selección de un campo usa documento, página, cobertura, plan, prestación, tipo y, cuando hay más de una columna, período/ámbito; no el valor esperado. La comparación del valor solo ignora espacios y diferencias de mayúsculas/acentos; no convierte UF, pesos, tasas ni porcentajes.

**Estos resultados no son una precisión global del contrato.** No se han anotado todos los campos propuestos ni medido los falsos positivos fuera de la muestra. Tampoco hay precisión validada para todas las exclusiones, notas, condiciones especiales o asociaciones de grupos. El evaluador informa ausencias y alternativas sin elegir silenciosamente una predicción correcta entre valores distintos.

El conjunto privado, los resultados detallados y ejemplos reales con su evidencia están en `/tmp/noergon-phase2-private`, fuera del repositorio y con permisos restringidos. No se copian PDF, páginas renderizadas reales ni textos contractuales al historial público. `scripts/evaluate_contract_conditions.mjs` permite repetir la evaluación con la referencia privada y las rutas originales; su salida estándar contiene solo agregados.

## Pruebas y ejemplos

**Resultado final: 165 pruebas backend correctas**, TypeScript y builds frontend/backend correctos, smoke PDF real y recorrido de navegador aprobados. Persisten avisos previos de Vite por tamaño de bundle y Browserslist antiguo. Las pruebas de API/RLS son locales; no se utilizó el proyecto remoto.

Las pruebas cubren celdas combinadas, encabezados, notas, valores vacíos, tope por evento bajo encabezado anual, tasas por mil, separación de planes, conflictos entre documentos, importación idempotente, coordenadas inválidas, exclusiones, borradores pendientes y contradicciones no resueltas.

El smoke real de Poppler/Tesseract/Ghostscript usa una tabla sintética con un límite compartido y comprueba PDF digital, escaneado, copia restringida, contraseña ausente/incorrecta/válida y renderizado de página. Las pruebas de acceso comprueban que un documento ajeno no se descarga ni renderiza. Las regresiones existentes verifican RLS y las etapas técnicas.

El navegador usa exclusivamente datos sintéticos y verifica tabla de condiciones, región sincronizada, importación al borrador con estado pendiente y navegación/guardado existentes. Las capturas públicas también son sintéticas:

- `validation/noergon-phase2-conditions.png`
- `validation/noergon-phase2-evidence.png`

Ejemplo sintético: una consulta con reembolso propuesto, una unidad porcentual, un grupo y una advertencia de celda compartida se incorpora como condición pendiente; su cita y región permanecen disponibles. Los ejemplos contractuales reales y sus valores se entregan únicamente en el informe privado, fuera de Git.

## Límites restantes

- No se garantiza reconstrucción completa de cualquier tabla. Bordes débiles, marcos dobles, texto sin cuadrícula y documentos degradados pueden dejar una tabla parcial o una vista de texto sin columnas interpretadas. El texto íntegro de cada página se conserva; las vistas extensas de tablas tienen límites de visualización.
- Las notas se conservan con su página/contexto. No se garantiza asignar automáticamente cada nota a todas y solo las filas afectadas, especialmente entre páginas.
- Algunas prestaciones comparten una celda descriptiva con varias líneas y permanecen agrupadas. No se fragmentan arbitrariamente en prestaciones independientes.
- Los grupos o planes sin respaldo suficiente requieren asignación en la revisión. Las cláusulas narrativas complejas conservan su texto y excepciones; no todas se descomponen en números independientes.
- Una referencia en exclusiones no habilita un beneficio. La clasificación contextual es determinista y sigue requiriendo revisión en documentos atípicos.
- Las ambigüedades revisadas por el usuario no sustituyen una validación técnica/jurídica independiente. No se han confirmado contratos del usuario.
- Los controles nuevos de revisión se aplican en la API del módulo. No se alteraron las RPC/migraciones históricas ni se probó el proyecto Supabase remoto.

La extracción sigue siendo local y parcial donde el documento no permite una relación inequívoca. El objetivo práctico alcanzado es proponer e incorporar las filas estructurables y conservar el resto con su evidencia, reduciendo la transcripción; no se garantiza que solo quede trabajo manual en campos ambiguos para cualquier póliza.

## Archivos intervenidos en esta fase

- Backend: `policyPdf.ts`, `policyTableGeometry.ts`, `policyConditions.ts`, `contracts.ts`, `portfolioAdmin.ts`.
- Tipos: `shared/portfolio.d.ts`.
- Frontend: `ContractExtractionReview.tsx`, `PolicyDocumentReview.tsx`, `PolicyContractForm.tsx`, `PortfolioAdministration.tsx`, `lib/contractCandidates.ts`, `api.ts`, estilos específicos de la tabla/visor.
- Pruebas: `policy-conditions.test.ts`, `condition-import.test.ts`, `access.test.ts`, `pdf-local-smoke.mjs`, harness y smoke de navegador.
- Evaluador, informe y capturas sintéticas; protección de validaciones privadas en `.gitignore`.

El workspace contenía cambios previos; esta lista describe la intervención y no atribuye todos los archivos de `git status` a la fase 2.
