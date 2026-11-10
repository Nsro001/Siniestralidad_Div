# Persistencia y consumo — etapa 3 (sin proveedor)

Implementación local del 5 de noviembre de 2026. **No hay llamadas a Gemini, generación HTTP, API keys nuevas, facturación, despliegue ni migraciones remotas.** No se modifica el consolidado generado de cartera ni el diseño, dashboards, presentación o PDF. La etapa 4 requiere autorización independiente.

## Costo cero y verificación pendiente

`GEMINI_ENABLED=false` está en la configuración de ejemplo. `analysisAvailability()` permanece deshabilitado incluso si alguien configura accidentalmente `GEMINI_ENABLED=true`: falta implementar y autorizar la etapa 4. No se instancia un cliente de Gemini ni se añade una clave API o un cliente privilegiado automáticamente.

La política SQL admite exclusivamente `tier='free'` y `api_budget_clp=0`, protegidos por CHECK. El modelo es inicialmente NULL; no hay fallback, cambio de modelo, nivel pagado ni activación de facturación. Todos los límites efectivos iniciales son **cero**.

Se consultaron fuentes oficiales:

- [Cuotas](https://ai.google.dev/gemini-api/docs/rate-limits?hl=en): remiten a los límites activos del proyecto/modelo en AI Studio; son por proyecto, no por API key. La cuota diaria se reinicia según el horario del Pacífico.
- [Facturación](https://ai.google.dev/gemini-api/docs/billing): diferencia Free Tier y niveles pagados; no se realizó ninguna operación sobre cuentas o proyectos.
- [Precios](https://ai.google.dev/gemini-api/docs/pricing): la existencia de un nivel gratuito depende del modelo y funcionalidad.
- [Condiciones](https://ai.google.dev/gemini-api/terms): los servicios gratuitos pueden usar entradas/respuestas para mejora y revisión humana; no deben recibir información sensible, confidencial o personal.

**No se pudo verificar una cuota real de un proyecto/modelo seleccionado**, porque no hay proyecto/modelo acreditado en este repositorio ni acceso autorizado a su consola. No se incorporan cuotas deducidas de ejemplos públicos. Las reservas permanecen bloqueadas hasta acreditar proyecto, modelo, cuotas y facturación deshabilitada, con revisión de privacidad. Si el análisis sigue siendo confidencial aunque esté agregado, no debe habilitarse el envío gratuito. No se propone el nivel pagado como alternativa.

La evidencia se representa mediante hashes de documentos de verificación conservados fuera de estas tablas. `project_ref_sha256` debe coincidir con `verified_project_sha256`; `model` con `verified_model`; los límites del proyecto no pueden exceder RPM/RPD/TPM gratuitos acreditados. La acreditación caduca como máximo en 24 horas. Estas compuertas son **atestaciones operativas**, no una consulta automática a Google ni una garantía de que una configuración externa no haya cambiado. Cualquier futura llamada requerirá revalidar la ausencia de facturación en el proyecto real y vincularla a la credencial utilizada, sin almacenar esa credencial en PostgreSQL.

## Migración y tablas

Nueva migración independiente: `supabase/migrations/202611050001_analysis_persistence.sql`, posterior a las nueve existentes. No se ejecutó en Supabase remoto. Las pruebas crean el esquema completo en PGlite local.

| Tabla | Contenido | Acceso |
|---|---|---|
| `analysis_runtime_policy` | Una fila: modelo/proyecto acreditados, estado gratuito, compuertas, límites, vigencia de evidencia, TTL, lease y cooldown | Solo backend privilegiado puede consultar/actualizar; no lectura funcional |
| `analysis_cache` | Propietario, empresa/póliza, versiones contractuales, períodos/coberturas, hashes, modelo, versiones de prompt/cálculos/privacidad, lease, estado, resultado estructurado y vencimiento | SELECT autenticado únicamente para propietario con acceso vigente a la empresa, estado ready y TTL vigente |
| `analysis_requests` | Una fila por intento reservado; propietario/empresa/póliza/modelo, token de lease, tiempos, estado, tokens reservados/reales/contabilizados | SELECT del propietario con acceso vigente; ninguna escritura funcional |

Las tres tablas habilitan RLS explícitamente. Las FK impiden asociar la póliza a otra empresa. Las versiones contractuales se comprueban al reservar: deben existir, pertenecer a la misma póliza/empresa y estar validadas. Ni un administrador funcional puede leer caché ajena mediante RLS.

`analysis_reserve` y `analysis_finish` son RPC **solo para `service_role`**, sin permisos para anon/authenticated. Las funciones auxiliares tampoco son endpoints funcionales. El servicio TypeScript recibe un cliente privilegiado por inyección explícita; no crea otro ni reutiliza automáticamente credenciales. El usuario/DB autenticados deben proceder del contexto de sesión verificado del backend, nunca del body del navegador.

Antes de leer, `AnalysisPersistence.read()` valida propietario e identidad y consulta la póliza con el cliente RLS del usuario. La lectura de resultados vuelve a usar ese cliente RLS, nunca el cliente privilegiado. Antes de reservar se repite esa autorización; las RPC privilegiadas vuelven a comprobar cuenta activa y reglas admin/asignación/KAM/jefatura sin modificar el JWT.

## Identidad y privacidad de caché

La clave SHA-256 canónica incorpora usuario, empresa, póliza, versiones contractuales, períodos ordenados, coberturas normalizadas, tipo de análisis, modelo, versión de prompt, versión de cálculos, versión de privacidad, hash de indicadores y hash de supuestos. El hash de indicadores incluye el payload permitido y la procedencia interna por snapshots/asignaciones; los supuestos incluyen su versión de configuración. Cambiar cualquiera de esas dimensiones produce una entrada diferente. Un mismo hash de clave con metadatos contradictorios se rechaza.

El contexto debe recalcularse en servidor mediante `prepareAnalysis()` desde snapshots autorizados antes de buscar un resultado; no se admite una clave o un conjunto de indicadores calculado por el navegador. Las entradas anteriores no se sobrescriben por un cambio de datos. El TTL limita además la reutilización: siete días por defecto, configurable hasta treinta. El vencimiento impide SELECT por RLS y permite una reserva nueva que vuelve a consumir cuota.

No se guardan payloads, prompts, documentos, citas, nombres empresariales/personales, RUT, diagnósticos, filas de gastos, API keys o cuerpos de error del proveedor. Las tablas contienen identificadores internos necesarios para permisos y trazabilidad; **esos identificadores nunca forman parte del payload para IA**.

En esta etapa los resultados persistibles son únicamente `analysis-result-v1`: tipo, hasta tres secciones con códigos controlados/referencias de métricas y hasta tres códigos de acciones. No existe campo de narrativa libre. La lista se valida en TypeScript y SQL; campos como `text`, `prompt`, `quote`, `patientRut` o `apiKey` se rechazan. Esto prepara la persistencia de análisis mensuales y conclusiones sin introducir texto sensible. La futura redacción requerirá un contrato adicional de validación y autorización en etapa 4.

## Lista permitida para futura IA

`prepareAnalysis()` reconstruye el JSON campo por campo; no propaga reportes completos ni texto libre de contratos. Solo incluye:

- Versión de esquema, tipo de análisis e índice relativo de mes, sin fechas o IDs de negocio.
- Prima UF, gasto técnico UF, siniestralidad, reembolso neto y diferencia de conciliación.
- Comparación anterior y efectos en pp únicamente si son verificables y conciliados.
- Por tipo contractual enumerado (Vida/Salud/Dental/Catastrófico): importes, variación, participación y contribución verificadas. Sin nombres libres de cobertura, planes, prestaciones o prestadores.
- Resultados numéricos de escenarios verificados, si se suministraron supuestos completos. Sin nombres, fuentes documentales o versiones libres de esos supuestos en el payload.

Antes de prepararlo exige aislamiento y conciliación. Cada grupo utilizado (mes/cobertura, y referencia cuando corresponda) debe tener **al menos diez pacientes distintos con RUT válido** y ningún paciente debe concentrar más del **20% del reembolso positivo**. Los RUT se procesan solo transitoriamente para contar/concentración y nunca se devuelven o hashean individualmente. Líneas no equivalen a pacientes: diez líneas de una sola persona no cumplen el umbral. Una identidad ausente bloquea el grupo.

Si un grupo falla, se bloquea **todo** el payload: no se elimina solo ese grupo manteniendo totales que permitan deducirlo por diferencia. No se envían conteos de grupos pequeños, diagnósticos ni rankings. Los umbrales son un control conservador inicial, no una prueba de anonimato formal o de ausencia de confidencialidad empresarial; necesitan revisión de privacidad independiente antes de cualquier envío gratuito.

## Reserva, concurrencia y consumo

1. La RPC comprueba actor/identidad y toma un advisory lock transaccional de proyecto. El bloqueo abarca deduplicación y presupuesto, no hay un SELECT/INSERT separado en el navegador.
2. Una entrada ready vigente devuelve hit sin nueva solicitud/tokens. Una reserva pending vigente devuelve in_progress; no crea otro intento.
3. Las compuertas gratuitas, modelo, proyecto, evidencia fresca y límites deben permitir la operación. Se reserva la cota máxima de entrada + generación; esta última debe incluir razonamiento si corresponde. No se estima con caracteres/4 ni se llama a un contador de tokens externo en esta etapa.
4. Se contabilizan solicitudes y tokens por usuario y proyecto, ventana móvil de 60 segundos, día calendario de Los Ángeles, día de Santiago y ventana móvil adicional de 24 horas. Las dos ventanas diarias y la móvil aplican el mismo límite diario; se usa la más restrictiva, sin asumir UTC−8 constante.
5. Se emiten requestId y leaseToken distintos y se registra el consumo reservado en la misma transacción. El lease por defecto dura 60 segundos. Solo su propietario/actor autorizado y token vigente pueden finalizarlo; un worker tardío no reemplaza un resultado.
6. Un éxito con uso completo válido concilia tokens reales. Fallos sin uso fiable, resultados inválidos y leases abandonados conservan la reserva completa. Las solicitudes nunca se reintegran al contador. Un consumo superior a lo reservado se contabiliza y deshabilita la política.

La tabla de solicitudes conserva también intentos fallidos/abandonados. No se borran para recuperar cuota. Si vence un lease, una nueva consulta lo marca abandonado, retiene su presupuesto y bloquea esa clave 24 horas; no hay takeover automático de una llamada cuyo desenlace podría ser incierto.

Un 429 se clasifica como `rate_limited`, conserva presupuesto y activa bloqueo de proyecto hasta el siguiente día del Pacífico. Timeout/fallo de proveedor activan cooldown de quince minutos por defecto. No hay bucles, timers de reintento, cambio de modelo ni subida de nivel. El manejador de transporte/AbortSignal se implementará solo si se autoriza etapa 4; esta etapa implementa persistencia de esos desenlaces, no peticiones de red. El fallback actual sigue siendo el motor determinista existente.

## Presupuesto propuesto, NO activado

| Control | Valor efectivo instalado | Candidato para revisión futura |
|---|---:|---:|
| Costo de Gemini | $0 CLP | $0 CLP exclusivamente |
| Solicitudes proyecto/minuto | 0 | 2 |
| Solicitudes proyecto/día | 0 | 20 |
| Solicitudes usuario/minuto | 0 | 1 |
| Solicitudes usuario/día | 0 | 5 |
| Tokens proyecto/minuto | 0 | 6.000 |
| Tokens proyecto/día | 0 | 60.000 |
| Tokens usuario/minuto | 0 | 3.000 |
| Tokens usuario/día | 0 | 15.000 |
| Máximo entrada/generación por solicitud | 0 / 0 | 2.000 / 1.000 |

Los candidatos son límites internos propuestos, **no cuotas gratuitas verificadas de Google**. Deberán reducirse si la cuota acreditada es menor, con margen para otros consumidores del mismo proyecto y para el prompt/esquema completos. No se activan automáticamente al cargar evidencia ni se incorporan como defaults. Hace falta autorización de etapa 4 y comprobar las cotas/tokenización reales del modelo antes de cualquier solicitud.

## Validación y operación pendientes

Las pruebas locales cubren instalación tras las nueve migraciones, RLS, revocación, paridad KAM/jefatura, RPC privadas, reservas simultáneas, cada límite, TTL, invalidación, consumos inciertos, 429, fencing y privacidad. PGlite usa un único backend PostgreSQL que serializa consultas concurrentes; las pruebas verifican los invariantes atómicos, pero una prueba de carga con múltiples sesiones PostgreSQL independientes sigue pendiente antes de habilitar proveedor.

No se agrega limpieza automática: los TTL no borran físicamente registros. Antes de producción se debe aprobar retención y una tarea privilegiada que elimine datos vencidos en orden seguro, conservando al menos las ventanas de presupuesto activas. Las FK restrictivas conservan trazabilidad y pueden impedir eliminar cuentas/empresas hasta efectuar esa limpieza. No deben purgarse solicitudes recientes para reiniciar límites.

No hay nuevas rutas de generación ni cambios de interfaz/PDF. Las rutas existentes no consultan estas tablas, de modo que la aplicación sigue funcionando aunque la nueva migración aún no se aplique. Para desactivar en el futuro bastará mantener el flag y la política deshabilitados; no se requiere eliminar históricos.
