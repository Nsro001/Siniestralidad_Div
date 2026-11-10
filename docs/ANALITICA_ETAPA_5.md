# Etapa 5 — análisis en pantalla e informe PDF por póliza

## Resultado y operación

En Administración de cartera → Indicadores por póliza, consultar los indicadores de una póliza, sus snapshots, meses y coberturas. El bloque nuevo ofrece:

- **Analizar mes seleccionado:** solicitud explícita del usuario para un solo mes; muestra gasto, prima, variaciones, descomposición matemática en puntos porcentuales, cobertura y revisión condicional fundamentada en diferencias positivas verificadas.
- **Preparar tres conclusiones:** resultado técnico del período, variación y coberturas, acciones y límites de renovación. Si calidad/completitud/base/conciliación/anonimización no están verificadas, se muestran el motivo y cero conclusiones.
- **Exportar PDF de póliza:** vuelve a cargar y verificar las fuentes actuales en un endpoint GET de solo lectura. Reutiliza caché compatible si existe; en caso contrario usa el resultado determinista recién verificado o explica el bloqueo. No ejecuta POST de generación, reservas ni proveedor.

Los distintivos permanecen en pantalla y PDF: «Análisis determinista · sin IA» o «Simulado · no es IA real». El código rechaza la presentación de origen real, que continúa deshabilitado. Las respuestas no se interpretan como diagnóstico ni como evidencia de causas clínicas. Las recomendaciones son condicionales: no se modifican beneficios automáticamente.

Se conserva el informe empresarial existente, con sus gráficos, tarjetas y conclusiones descriptivas previas. El informe final nuevo de póliza es independiente: portada NOERGON, alcance, gráfico por cobertura, tablas mensuales de indicadores/conciliación/calidad, análisis mensual solicitado y tres tarjetas de conclusiones si son válidas. No se añaden resultados individuales al consolidado empresarial ni se abren sus desgloses desde un gráfico del PDF de póliza. Las comparaciones anuales que no existen en el informe por póliza se muestran ausentes.

## Integridad y persistencia

Los endpoints nuevos reutilizan el cargador autorizado de `policyScopeRoute` y los indicadores backend de las etapas previas. No aceptan cifras, conclusiones, usuario, modelo ni identidad de caché suministrados por el navegador. Las empresas, pólizas, versiones, snapshots, asignaciones y revisiones se leen con el cliente Supabase del usuario y RLS. El servicio comprueba además que la póliza sigue visible antes incluso del fallback.

`GET /report/policies/:id/analysis/export` obtiene un conjunto coherente de fuentes y revisiones para indicadores, conclusiones y mes opcional. Los modelos simulados se leen exclusivamente del perfil interno `gemini-synthetic`, `prompt-v2`. No es un modelo real ni una cuota contratada. La clave y filtros incluyen usuario, empresa, póliza, versiones, períodos, coberturas, snapshots/procedencia, revisiones, indicadores, supuestos, cálculo, prompt y privacidad. Una revisión nueva, cambio contractual o modificación de alcance invalida el resultado anterior. La clave se recalcula con las fuentes actuales, nunca con una copia del navegador.

Las filas reutilizables deben ser `ready`, de origen simulado acreditado, del usuario actual, de la misma empresa/póliza, con el hash y dimensiones exactos y TTL vigente. El contenido se vuelve a validar contra el catálogo de cifras actual. Las caducadas, alteradas, de otro usuario o sin procedencia acreditada no se usan. La lectura requiere RLS y condiciones explícitas, sin cliente privilegiado. La migración local `202611050004_analysis_display_provenance.sql` agrega `analysis_cache.origin` y acredita únicamente las finalizaciones simuladas futuras del flujo existente; los resultados anteriores permanecen `unverified`. Conserva las autorizaciones, el fencing, los límites y la contabilidad de las etapas 3/4.

Sin esa migración local, la ausencia de `origin` permite el fallback determinista, pero impide reutilizar caché. No se aplica ninguna migración remota ni se intenta reparar datos desde la interfaz.

La pantalla limpia resultados al cambiar empresa/póliza/snapshots/períodos/coberturas o recargar indicadores tras una revisión. Se descartan respuestas que llegan después de navegar o cambiar de mes. La expiración visible usa un reloj local sin peticiones. El PDF valida alcance y TTL antes de preparar y antes de imprimir, incluidos los resultados mensuales; el deck se monta solo durante exportación y se retira al finalizar. Un cambio de filtros cancela una exportación pendiente.

Los resultados deterministas no se guardan como si fueran respuestas del proveedor: el PDF usa la excepción permitida de fallback calculado con datos verificados. Una pantalla abierta refleja la última comprobación; cambios de otro usuario se detectan al volver a consultar o exportar, sin sondeo automático. No se generan respuestas al navegar, renderizar gráficos, cambiar filtros o abrir el diálogo de impresión.

## Costo y límites

`GEMINI_ENABLED=false`, `ANALYSIS_PROVIDER_CALLS_IMPLEMENTED=false` y los límites predeterminados de PostgreSQL en cero se conservan. Ninguna ruta nueva construye un proveedor, llama a `analysis_reserve`, contabiliza tokens ni configura claves. No hay SDK, transporte HTTP a Gemini, facturación ni fallback pagado. El flujo público de etapa 5 solo calcula localmente o lee resultados simulados ya persistidos y verificados. La simulación de las pruebas es sintética y no habilita proveedor en la aplicación.

## Archivos modificados en esta etapa

- `backend/src/policyAnalysis.ts`: servicio determinista y lectura segura de caché con validación semántica.
- `backend/src/policyScopeRoute.ts`: acciones explícitas y endpoint de exportación de solo lectura.
- `shared/analysis.d.ts`: contrato compartido de alcance, calidad, procedencia y conclusiones.
- `supabase/migrations/202611050004_analysis_display_provenance.sql`: procedencia de resultados, sin activación de proveedor.
- `frontend/src/api.ts`: solicitudes explícitas y lectura de exportación.
- `frontend/src/components/PolicyTechnicalPanel.tsx`: integración e invalidación tras consultas/revisiones.
- `frontend/src/components/PolicyAnalysisPanel.tsx`: acciones, comprobación de alcance, exportación y deck independiente.
- `frontend/src/components/PolicyAnalysisView.tsx`: presentación de fuente, tres conclusiones, bloqueos, calidad y vencimiento.
- `frontend/src/components/PrimasCharts.tsx`: admite alcance individual, calidad contractual y modo sin navegación a reportes empresariales.
- `frontend/src/styles.css`: distintivos de procedencia y tablas PDF.
- `backend/tests/policy-analysis.test.ts`: cifras verificadas, calidad, caché, expiración, versiones/revisiones, permisos y HTTP.
- `backend/tests/analysis-persistence-db.test.ts`: ejecuta la migración nueva en PostgreSQL local y verifica procedencia.
- `frontend/tests/technicalHarness.tsx` y `frontend/tests/technical-browser.mjs`: navegación, generación explícita, tres conclusiones, simulación, expiración, rechazo de IA real, revisión, PDF e invalidación.
- Este informe y evidencias sintéticas en `docs/evidence/`.

Todos los cambios locales anteriores se conservan; no se edita el consolidado generado de cartera.

## Riesgos y límites pendientes

- Ningún resultado remoto o cuota gratuita real se ha verificado. Habilitar Gemini requiere autorización explícita y las condiciones técnicas/contractuales documentadas en etapa 4.
- Solo se reutiliza el perfil simulado interno acreditado. Cachés antiguas, modelos diferentes y procedencias desconocidas no se reinterpretan como IA real; se recurre al determinista.
- Se conserva el umbral conservador de anonimización de etapa 3 incluso en el bloque nuevo determinista. Grupos pequeños pueden tener indicadores visibles en la tabla autorizada, pero el bloque de conclusiones permanece bloqueado.
- La exportación no infiere supuestos de renovación de formularios sin validar ni reutiliza valores que no forman parte de su identidad. Si no se incluyen supuestos verificados, las conclusiones dicen que no se proyecta reajuste; el motor de escenarios existente sigue disponible por separado.
- PGlite valida esquema/RLS/funciones locales; no sustituye una prueba autorizada de conexiones simultáneas en el proyecto real. No se ha desplegado ni aplicado la nueva migración remotamente.
- Persisten advertencias previas de tamaño del bundle y antigüedad de Browserslist. No se actualizan dependencias para esta entrega.

## Pruebas y evidencias

- `npm test` en backend: **147/147 correctas**, incluidas las seis pruebas nuevas del servicio/HTTP y la migración ejecutada exclusivamente en PGlite. Verifica aislamiento por usuario/empresa/póliza, RLS, caducidad, procedencia, cifras alteradas, nueva revisión/versión y ausencia de reservas de tokens.
- `npm run build` de backend y frontend; `tsc --noEmit` de frontend: correctos.
- `node tests/technical-browser.mjs`: correcto. Comprueba cero solicitudes de análisis al navegar/cambiar filtros, POST solo por botones, exactamente tres conclusiones, origen determinista/simulado, rechazo de origen real, expiración sin peticiones, invalidación por revisión, cambio de filtros y exportación sin POST de generación. El mock rechaza rutas no previstas.
- `node tests/browser-smoke.mjs`: correcto. Conserva branding, cartera, edición contractual, filtros, móvil y PDF empresarial.
- `git diff --check`: correcto.

Evidencias visuales con datos sintéticos, sin Gemini real: [determinista](evidence/etapa5-determinista.png), [simulado](evidence/etapa5-simulado.png), [PDF por póliza de 12 páginas](evidence/etapa5-poliza.pdf), [página de conclusiones renderizada](evidence/etapa5-pagina-pdf.png). Se inspeccionaron la imagen de una página renderizada y el texto extraído del PDF: portada/alcance, gráficos, conciliación y exactamente tres tarjetas finales. Las fechas de caducidad archivadas en estas evidencias corresponden al instante de su prueba, no a resultados reutilizables en producción.

Ejemplo de la prueba backend: prima 100 UF constante y gasto 100 → 120 UF, con detalle conciliado, base pagada y completitud revisada: +20 UF, +20% de gasto, +20 puntos porcentuales por gasto, 0 pp por prima y revisión condicional de Salud. Las evidencias visuales usan un ejemplo separado de cinco meses: prima total 500 UF, gasto total 400 UF, siniestralidad ponderada 80%; último mes 80 UF frente a 60 UF (+20 UF, +33,33%, +20 pp). No se convierte una variación porcentual en puntos porcentuales ni se inventa una tasa de renovación.
