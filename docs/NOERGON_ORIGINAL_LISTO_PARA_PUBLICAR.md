# Actualización mínima del NOERGON original — 14 de noviembre de 2026

**Estado: implementación local terminada y probada; no publicada.** Actualiza el sistema original de siniestralidad-div.vercel.app. No crea un sistema paralelo, servicios, tablas o migraciones. La demo anterior no se usa como base de esta actualización.

## Código y paquetes

Base de producción comprobada: commit `3e16595b139889e98f127cb3f9cfd3826c235e16`, despliegue Vercel `dpl_FUEtmcoM8JzPdB4FWWD7TaH7s3jb`. Candidato y SHA-256 exactos: `.local-validation/original-update-20261114/release-review.json`.

Rama local: `release/noergon-original-gemini-20261114`. No se cambió la rama de trabajo, el índice normal, main ni el remoto. El candidato contiene solo las diferencias acotadas contra el original, sin los cambios experimentales del workspace.

- Fuentes completas: `.local-validation/original-update-20261114/noergon-original-actualizado-source.tar.gz`.
- Parche aplicable sobre el original: `.local-validation/original-update-20261114/actualizacion-original.patch`.
- Frontend compilado contra la API original: `.local-validation/original-update-20261114/noergon-original-frontend.zip`.
- PDF y Excel sintéticos de la verificación: `noergon-original-report.pdf` y `.xlsx` dentro del mismo directorio. No contienen datos del usuario.

El ZIP estático no instala ni activa el backend. No subir fuentes, secretos o el TAR al directorio público del frontend. La fuente queda preparada para Node en el servicio existente, sin Docker.

## Resultado funcional

Se conserva la cartera, roles, cargas de primas/gastos, filtros, gráficos y motores del original. Se añaden “Analizar este mes con Gemini” y “Generar conclusiones con Gemini”. El mes analizado es el último seleccionado; las conclusiones abarcan todos los períodos seleccionados. La lectura mensual, las conclusiones y exactamente tres acciones al cierre abren el informe. Los mismos resultados aprobados alimentan pantalla, PDF y las primeras hojas de Excel; el detalle anterior de gastos permanece.

El backend calcula primas, gasto declarado, siniestralidad, comparación con el promedio mensual del motor existente y foco por cobertura. No confunde reembolso del detalle con gasto declarado ni atenciones con líneas. Los faltantes no se convierten en cero. El original no tiene una base contractual revisada que sostenga una proyección de renovación: se informa explícitamente “Proyección no disponible”, con lo que falta, en lugar de inventar una tasa.

Gemini solo selecciona y prioriza referencias de un catálogo numérico cerrado. Las cifras y frases verificadas son del backend; no se ofrece redacción libre ni causalidad inventada. Tres frases y exactamente tres acciones respaldadas. No se envían nombres de empresa/personas/prestadores, RUT, identificadores, documentos ni filas de salud. La respuesta se valida antes de publicarse en la interfaz. Los POST ignoran cifras aportadas por el navegador. Acceso normal por sesión y alcance RLS del cliente; caché por usuario, ID de cliente y hash del contexto. Un cambio invalida los identificadores aprobados y exportar puede devolver 409, sin regenerar.

No hay llamadas al cargar, cambiar filtros, reintentar conexión o exportar. Solo los botones pueden solicitar generación. Error, respuesta inválida, falta de datos o cuota agotada conservan el análisis determinístico. Timeout de 15 segundos, sin reintentos, modelo fijo gemini-3.1-flash-lite, entrada acotada y salida estructurada. Una solicitud ambigua consume el límite local.

Se corrige el desmontaje de la pantalla durante un fallo temporal de /me: se conserva la carga montada pero se ocultan los controles hasta verificar el acceso. HTTP 401/403 siguen descartando permisos. La importación usa inicialmente actualizar por clientes; sigue disponible el reemplazo completo con su advertencia. Se incorpora la corrección ya probada de orden ZIP/metadatos Excel, períodos YYYYMM y RUT/DV separados. No cambia la aritmética de reportes.

## Verificaciones

- Suite del candidato original: **51 pruebas backend aprobadas**. No se sustituyen por el número de pruebas del proyecto experimental. Después se repitieron las cuatro pruebas focalizadas por un refuerzo del hash de cliente.
- TypeScript backend/frontend y build Vite correctos; aviso conocido de bundle grande.
- Navegador real contra el candidato: carga visible para admin, dos botones bajo demanda, Google simulado, cero generaciones al cargar/exportar y PDF/Excel del resultado aprobado. El proveedor de prueba bloquea cualquier destino externo.
- Archivos reales leídos exclusivamente en localhost y con RPC simuladas: 288 primas y 28.456 gastos; originales con huellas intactas. Un fallo de append simulado devuelve 503 sin llamar finish. Esta prueba no acredita almacenamiento real de Supabase ni recursos del hosting.
- Motores report.ts, monthly.ts, conclusion.ts, expenseExport.ts, storage.ts y componentes financieros protegidos idénticos byte por byte al original. parser.ts cambia de forma explícita por las correcciones de importación. Los tests comparan las celdas del detalle Excel y el análisis aprobado.
- Parche comprobado en seco sobre una copia limpia de 3e16595. Paquetes revisados sin .env, respaldos, node_modules ni claves privadas. No se repitió npm ci: se compilaron con las dependencias locales existentes y el lockfile de seguridad previamente validado.
- El backend de seguridad mantiene los dos avisos moderados documentados de uuid/ExcelJS; no se forzó una versión incompatible para ocultarlos.

## Gemini real y activación

La única prueba real sintética autorizada ya pasó HTTP 200, con gemini-3.1-flash-lite. No hubo más llamadas reales durante esta implementación. Ver `publicacion/GEMINI_PRUEBA_REAL_ORIGINAL_20261114.md`. No reutilizar el cupo de prueba ni generar otro test sin autorización.

La publicación nueva debe mantener la clave solo en el entorno privado del backend. No usar VITE_GEMINI_API_KEY. El código está apagado por defecto; la configuración propuesta para uso manual de la aplicación es:

```
GEMINI_API_KEY=<clave privada, introducir solo en Render>
NOERGON_GEMINI_REAL_ENABLED=true
NOERGON_GEMINI_BILLING_DISABLED_CONFIRMED=true
NOERGON_GEMINI_DAILY_LIMIT=10
```

La confirmación de ausencia de facturación procede del usuario. No se habilita facturación ni se cambia el plan. No se fijan límites de Google superiores a los verificados. El valor 10 es un límite operativo conservador del backend, no una nueva cuota de Google ni permiso para diez pruebas del agente: las llamadas de uso normal requieren pulsación explícita del usuario. Se respeta además 15 solicitudes/minuto localmente y no se cambia de modelo automáticamente.

**Límite importante:** este parche mínimo conserva cuota y caché en memoria del proceso; un reinicio/suspensión los reinicia y las exportaciones de resultados vencidos exigen actualizar. No es una reserva persistente global ni garantiza un máximo de diez llamadas por día entre reinicios/múltiples instancias. La cuota Free de Google sigue siendo por proyecto; debe conservarse la ausencia de facturación. Si se exige ese máximo global, hay que revisar una reserva persistente antes de activar; no se introduce SQL ni se afirma que ya exista. El código de prueba sintética persistente anterior no se activa ni se mezcla con este flujo.

## Publicación controlada del original y recuperación

1. Resolver el destino comercial del frontend antes de realizar cambios remotos. El último plan confirmado fue Hobby; la consulta actual del equipo no expone su plan. Verificar si cambió. [Hobby restringe el uso a personal/no comercial](https://vercel.com/docs/plans/hobby); [uso comercial requiere Pro o Enterprise](https://vercel.com/docs/limits/fair-use-guidelines). No cambiar plan ni iniciar trial/pagos. Con presupuesto $0 adicional, alternativa: servir este MISMO frontend original desde el hosting Boxhosting ya contratado, apuntando a la MISMA API original y Supabase, sin aplicación nueva ni otra base.
2. Capturar configuración y variables privadas actuales del servicio original, sin imprimir sus valores. Conservar despliegue previo y respaldo de fuentes. No importar ni sobrescribir datasets existentes para probar.
3. Ambos servicios Render siguen en main y autodeploy. No empujar a main. Publicar únicamente la rama candidata exacta; los servicios que siguen main no la desplegarán. Vercel puede crear una preview de esa rama: revisar su protección, sin promoverla como producción comercial Hobby.
4. En el primer servicio original `srv-d615it0nputs73afnuh0`, conservar Node, plan Free, región y URL. Propuesta: autodeploy no, rama candidata, build `npm ci && npm run build`, start existente `npm run start`, health `/health`. Mantener las variables existentes y añadir solo las de Gemini anteriores. La clave se configura por canal privado. No tocar `srv-d6152tq4d50c73eg6t0g`, que continúa en main; no habilitar workers ni planes de pago.
5. Desplegar el SHA candidato explícito en el primer servicio. Comprobar health, /me autenticado, permisos y lectura de datos ya presentes. No enviar otra generación de prueba ni repetir cargas reales. Los nuevos endpoints son aditivos, por lo que el frontend antiguo conserva su contrato.
6. Con el backend sano, publicar/promover el frontend del MISMO candidato en el destino acordado. Mantener API https://siniestralidad-div.onrender.com. Si el dominio cambia a Boxhosting, añadir únicamente ese origen a la lista CORS del primer backend conservando el origen Vercel. No cambiar DNS del dominio principal sin alcance concreto.
7. Verificar carga de página, controles admin, lectura de informes, análisis determinístico y exportación. No pulsar generación Gemini automáticamente como health check. El usuario ejecuta el análisis bajo demanda si desea consumir cuota normal.
8. Recuperación: deshabilitar solo la generación del primer backend si hay problemas, restaurar su rama/configuración/variables previas y desplegar el SHA anterior 3e16595. Recuperar el alias Vercel hacia dpl_FUEtmcoM8JzPdB4FWWD7TaH7s3jb si se promovió allí, o restaurar el ZIP previo del directorio exclusivo si se eligió Boxhosting. Verificar health, sesión, lectura y exports. No borrar datos, reservas, auditorías ni cambiar RLS para recuperar.

No se ejecutaron estos pasos remotos. La autorización anterior de la API key Render era de solo lectura; una modificación remota debe quedar autorizada para el recurso y variables concretos anteriores. No se necesita que el usuario vuelva a compartir la clave Gemini ni sus contraseñas.
