# Etapa 4 — adaptador Gemini preparado, sin servicio real

Implementación local: dos operaciones internas `GeminiAnalysisAdapter.monthly` y `.conclusions`. No hay SDK, transporte HTTP, endpoint de generación, clave, facturación, llamada real ni integración automática con React/PDF. `GEMINI_ENABLED=false` permanece en el ejemplo de configuración; el código mantiene además `GEMINI_ENABLED=false` constante y `ANALYSIS_PROVIDER_CALLS_IMPLEMENTED=false`, incluso si se cambia la variable de entorno. No se cambian los límites cero instalados por etapa 3. Costo API de esta implementación: $0 CLP por ausencia de llamadas.

## Recorrido y seguridad

1. El backend recibe un `ScopeInput` cargado desde repositorios autorizados, nunca indicadores del navegador. Comprueba acceso a empresa/póliza usando el cliente del usuario y RLS antes de preparar incluso el fallback.
2. `prepareAnalysis` reutiliza aislamiento contractual, versiones validadas, asignaciones verificadas, conciliación, completitud y base del gasto revisadas. Los supuestos de renovación pasan por el motor técnico. Los aparentes meses parciales son incidencias de datos: no se prorratean ni se aceptan como observación completa.
3. La lista permitida incluye únicamente importes UF, razones, diferencias, porcentajes y puntos porcentuales calculados, cobertura y base pagada/incurrida enumeradas e índices opacos de agregados. Se conserva el umbral de privacidad de etapa 3 (mínimo diez pacientes distintos y concentración máxima 20%). No viajan fechas, nombres de empresa/aseguradora, números de póliza, UUID, RUT, diagnósticos, prestaciones, documentos, notas ni fuentes contractuales. Los identificadores internos se usan solo para autorización/procedencia de caché.
4. Se acredita política gratuita vigente, proyecto/modelo exactos, privacidad y facturación deshabilitada antes de leer caché o reservar. Las comprobaciones se repiten atómicamente en PostgreSQL. Solo las pruebas inyectan un proveedor explícitamente simulado y una política sintética; esos números no representan cuotas reales.
5. La clave existente incluye usuario/empresa/póliza/versiones/períodos/filtros/indicadores/supuestos/modelo/prompt/cálculo/privacidad. `prompt-v2` y el payload `aggregate-v2` (que incorpora base del gasto explícita) separan los resultados nuevos. Se bloquea interpretación al mezclar bases pagadas/incurridas. La caché se lee con RLS y su contenido se verifica contra las cifras actuales antes de reutilizarlo.
6. Solo una reserva atómica puede generar; `in_progress`, presupuesto agotado o bloqueo devuelven fallback, sin esperar ni reintentar. Lease/fencing impiden publicar respuestas tardías. Timeout cancela la simulación. Error 429 mantiene contabilidad y enfriamiento existentes; fallos sin uso conocido conservan la reserva de tokens. Si falla la finalización no se publica la respuesta: queda sujeta a la recuperación conservadora del lease existente.

## Contrato de salida

`analysis-result-v2`: `kind`, `sections[{code,findings[{ref,value}]}]`, `recommendations[{code,evidenceRef}]`, sin campos extra ni texto libre. Mensual exige una sección; final exactamente tres, ordenadas: resultado técnico, escenario de renovación y acción. Una sección de renovación vacía informa que no existe proyección verificable. Cada cifra debe coincidir exactamente con su referencia del catálogo; se conserva el valor de precisión del backend, con formato visual independiente.

Solo se permite recomendar `review_benefits` asociado a una diferencia positiva UF por cobertura citada en la respuesta. El backend produce texto condicional con cobertura y aumento cuantificado; no modifica beneficios. No se autorizan recomendaciones farmacológicas, de convenios o educativas porque los agregados actuales no acreditan sus causas. No se usa texto libre del proveedor para evitar almacenar información sensible o afirmaciones sin respaldo. No se presentan líneas de reembolso como atenciones ni gasto pagado como incurrido.

Migración local nueva `202611050003_analysis_grounded_results.sql`: reemplaza únicamente la función de validación de resultados, conserva su OID, restricciones/RLS/tablas de etapa 3 y compatibilidad v1. No altera el consolidado ni ejecuta migraciones remotas. La validación SQL controla estructura/listas permitidas; la validación semántica contra indicadores corresponde al backend confiable antes de escribir y al leer.

## Ejemplo comprobable

Prima 100 UF en ambos meses; gasto 100 → 120 UF, reembolsos conciliados y diez pacientes por cobertura: diferencia Salud +20 UF, variación +20%, siniestralidad 100% → 120%, efecto gasto +20 puntos porcentuales, efecto prima 0. `m0.c0.differenceUf=20` admite revisión condicional de Salud. Una cifra inventada de 999 o una referencia a paciente se rechazan. Con prima 100 → 120 UF y gasto 100 → 120 UF, la siniestralidad permanece 100%; el motor separa +20 pp por gasto y −20 pp por prima.

## Condiciones pendientes para habilitar un servicio real

Esta entrega no habilita el servicio real. Se requiere autorización posterior para implementar/conectar transporte y generación explícita; cambiar una variable no basta.

- Seleccionar modelo disponible y comprobar en AI Studio las cuotas gratuitas reales del proyecto/modelo, con facturación deshabilitada, sin fallback pagado. Registrar evidencia y verificación de máximo 24 horas. No hay cuota positiva propuesta hasta esa comprobación. Presupuesto monetario obligatorio: cero CLP; todos los límites operativos continúan cero por defecto.
- Revisar las condiciones aplicables al nivel gratuito y aprobar expresamente que los agregados desidentificados no constituyen información sensible/confidencial. La anonimización estadística no garantiza por sí sola esa condición contractual. Si no puede acreditarse, mantener bloqueo.
- Verificar compatibilidad del esquema estructurado con el modelo seleccionado, tokenización real, instrucciones/tokens internos y razonamiento. El límite de bytes del request sirve exclusivamente para simulación y no certifica un límite real de tokens. Implementar transporte real solo después de acreditar límites superiores seguros.
- Validar aislamiento y reservas con múltiples conexiones PostgreSQL reales y permisos reales del proyecto en un entorno autorizado. PGlite verifica el esquema y funciones PostgreSQL, pero serializa las consultas de un solo backend. Aplicar migraciones solo con autorización aparte y respaldo.
- Mantener controles diarios, por minuto, por usuario/proyecto, enfriamiento y reserva conservadora; servicio apagado al vencer evidencia, ante sobreconsumo o incertidumbre. No existen reintentos automáticos ni cambios automáticos de modelo.

Referencias oficiales consultadas: [límites de Gemini](https://ai.google.dev/gemini-api/docs/rate-limits), [precios](https://ai.google.dev/gemini-api/docs/pricing), [condiciones](https://ai.google.dev/gemini-api/terms). No se asumen cuotas públicas como derechos del proyecto.

No se autoriza ni implementa etapa 5.

## Archivos de esta entrega

- `backend/src/geminiAdapter.ts`: operaciones, contrato de solicitud, gates, simulación, timeout y coordinación persistente.
- `backend/src/analysisGrounding.ts`: catálogo de cifras, validación semántica, fallback y presentación controlada.
- `backend/src/analysisPrivacy.ts`: resultado v2 y payload agregado v2 con base explícita; conserva v1.
- `backend/src/analysisPersistence.ts`: lectura privilegiada de política operativa y estado de transporte real deshabilitado.
- `backend/tests/gemini-adapter.test.ts`: proveedor simulado y pruebas de integración/validación/fallos.
- `backend/tests/helpers/analysisFixture.ts`: datos sintéticos con marcadores sensibles para pruebas de privacidad.
- `backend/tests/analysis-privacy.test.ts`: actualiza el motivo de bloqueo del transporte real.
- `backend/tests/analysis-persistence-db.test.ts`: carga migración nueva, persistencia v2, compatibilidad v1 y aislamiento RLS.
- `supabase/migrations/202611050003_analysis_grounded_results.sql`: nueva migración local de validación.
- `docs/ANALITICA_ETAPA_4.md`: informe técnico, presupuesto cero y requisitos de habilitación.

## Verificación

Build TypeScript de backend, TypeScript y build Vite de frontend: correctos. Scripts `technical-browser.mjs` y `browser-smoke.mjs`: correctos, incluyendo PDF sin regeneración, permisos, revisión manual y diseño existente. Los tests de HTTP/navegador requieren permiso para puertos de loopback del entorno; las ejecuciones autorizadas son exclusivamente locales. Se conservan advertencias existentes de tamaño de bundle y antigüedad de Browserslist. No se añadieron dependencias ni se actualizó ExcelJS.

Resultado final: `npm test` del backend, **141/141 pruebas correctas**, incluidas 15 del adaptador simulado y pruebas PostgreSQL de RLS, reservas, límites, contabilidad, fencing y compatibilidad v1/v2. Los casos nuevos cubren también caché contaminada, fallos de persistencia, política vencida/no acreditada, bases del gasto y escenario numérico 1200 UF proyectadas / 0,8 = 1500 UF de prima requerida (+25% sobre 1200 UF, exclusivamente con supuestos sintéticos explícitos). `git diff --check`: correcto.
