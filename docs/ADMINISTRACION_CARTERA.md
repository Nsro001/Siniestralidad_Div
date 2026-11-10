# Administración de Cartera

Implementación local del 30 de octubre de 2026. No aplica cambios automáticamente a Supabase ni despliega producción. Por indicación posterior del usuario, se utilizará el Supabase actual, cuyos datos son de prueba; no se exige crear otro proyecto. La guía operativa actual es `docs/PASO_A_PASO_LOCAL_Y_PUBLICACION.md`.

## Archivo de Supabase

**`supabase/ADMINISTRACION_CARTERA_COMPLETO.sql` contiene todos los cambios nuevos**: modelo contractual, ampliación de clientes, RLS, RPC, auditoría, snapshots de sábanas, bucket privado y resolución de identidad de importaciones.

Requiere PostgreSQL 15 o superior y las seis migraciones históricas hasta `202610160001_presentation_branding.sql`. Usar una sola modalidad:

- SQL Editor: aplicar el consolidado una vez. Toda la instalación nueva queda en una transacción.
- Flujo de migraciones: aplicar, en orden, `202610300001_portfolio_contracts.sql`, `202610300002_portfolio_storage.sql` y `202610300003_portfolio_import_identity.sql`.

No ejecutar ambas modalidades. El consolidado detecta una instalación previa y se detiene. Si se usa SQL Editor, registrar la aplicación conforme al procedimiento de migraciones del proyecto para no intentar aplicarlas después mediante CLI. El script no incluye las migraciones antiguas, porque recrear sus tablas sobre una base existente sería incorrecto.

Para regenerar el consolidado después de modificar sus fuentes: `python3 scripts/build_portfolio_sql.py`.

## Aplicación y comprobación

1. Comparar el esquema real con las migraciones del repositorio. Confirmar que no hay objetos o políticas de Storage adicionales que amplíen el acceso al bucket nuevo.
2. Obtener respaldo y verificar su restauración en un entorno aislado. El snapshot inicial crea una copia adicional en el almacenamiento de las sábanas vigentes; dimensionar espacio y ventana de migración.
3. Aplicar el SQL en Supabase de desarrollo. Confirmar que `portfolio-policies` tiene `public=false` y que usuarios ajenos no pueden listar ni descargar originales.
4. Compilar frontend y backend y habilitar el módulo. Los clientes históricos mantienen UUID, nombre de reportes, KAM/jefe, asignaciones, logos y JSON de primas/gastos.
5. Probar un cliente con dos aseguradoras, una póliza con varias coberturas y una renovación futura; comprobar que no sustituye la versión vigente hoy. Verificar reportes y exportaciones históricas antes del despliegue autorizado.

El backend usa el token del usuario para consultas, RPC y Storage. No se necesita una clave de servicio para el módulo. La clave secreta que ya existe sigue limitada al alta de usuarios Auth.

## Ejecución y OCR local

Se conservan los comandos existentes `npm ci`, `npm run build`, `npm run dev`/`npm start` en cada proyecto. No se añadieron dependencias npm.

El servidor de extracción requiere `pdfinfo`, `pdftotext`, `pdftoppm` (Poppler), `tesseract` y los idiomas `spa` y `eng` en PATH. En Debian/Ubuntu se pueden instalar con `apt-get install poppler-utils tesseract-ocr tesseract-ocr-spa tesseract-ocr-eng`.

Alternativamente, desde la raíz del repositorio:

```sh
docker build -f backend/Dockerfile -t siniestralidad-portfolio:local .
docker run --rm --memory=1g --cpus=2 --pids-limit=128 --read-only --tmpfs /tmp:rw,noexec,nosuid,size=512m --env-file backend/.env -p 4000:4000 siniestralidad-portfolio:local
```

La imagen ejecuta Node como usuario sin privilegios. No incorpora `.env`, sábanas locales ni logs al contexto de construcción. No se envían documentos a servicios de OCR/IA externos. Los originales se conservan en Supabase Storage privado, como parte del almacenamiento autorizado del proyecto.

Límites actuales: PDF original hasta 20 MiB; extracción hasta 40 páginas; un proceso local a la vez por instancia; timeout de 45 segundos por herramienta y presupuesto de cinco minutos por documento (el comando en curso puede tardar hasta su timeout). Configurar el timeout del proxy/backend para ese flujo. En hosting que interrumpe procesos largos, usar un servicio Node persistente para este backend; no alojar la extracción en una función con límite corto.

El original se guarda antes de extraer. Los estados quedan en DB y el botón «Consultar resultado» permite recuperar resultados si se pierde la respuesta HTTP. Ante reinicio del servidor o fallo se puede reintentar la extracción; no hay un servicio de cola que reprograme trabajos automáticamente. Si falta una herramienta, se devuelve un error explícito y se conserva el archivo.

Poppler conserva el texto por página y el espaciado de tablas; las filas con varias columnas se presentan para revisar. El OCR se activa en páginas con muy poco texto digital y puede forzarse desde el revisor para documentos mixtos, conservando también su texto digital. La extracción es genérica por etiquetas, no un modelo entrenado por aseguradora: puede omitir campos o columnas, especialmente en diseños complejos o páginas mixtas con una imagen dentro de una página de texto. El revisor puede consultar el original y completar cada campo con su página/cita. No se promete exactitud automática ni se incorporan prestaciones por defecto.

## Estructura implementada

La identidad de póliza y sus versiones, documentos, clientes, movimientos y vínculos son tablas relacionales con claves foráneas. Cada versión conserva un contrato JSONB tipado y validado que contiene coberturas, planes, grupos, condiciones y evidencias; así se guardan juntos e inmutables todos los términos de esa versión. No se crearon tablas independientes por cada prestación ni se poblaron catálogos con coberturas supuestas. Los planes/grupos se administran con formularios, sin exigir edición de JSON.

## Uso

- Administración de cartera → Datos del cliente: crear o editar razón social, RUT validado, contacto y estado. El nombre legado queda separado de la razón social editable para conservar los reportes.
- Documentos y renovaciones: cargar PDF con o sin cliente seleccionado, extraer localmente y revisar valores propuestos con su página de origen. Si se creó desde un PDF sin cliente, guardar el cliente asocia ese documento. También se puede asociar un documento pendiente a un cliente existente.
- Pólizas y aseguradoras: número y aseguradora identifican la póliza. Una vez creada esa identidad, sus cambios contractuales son nuevas versiones; para otra aseguradora/número se crea otra póliza. Borradores requieren al menos identidad y una fecha de efecto.
- Vida, Salud, Dental y Catastrófico: añadir solo coberturas documentadas. Cada cobertura permite varios planes, grupos y condiciones. Las condiciones admiten prestaciones, porcentajes, topes, capitales, tasas, deducibles, edades, exclusiones, carencias, prestadores y textos especiales, con unidad, ámbito, periodicidad y evidencia propios.
- Los encabezados y condiciones extraídos se ofrecen para revisión. Se trasladan automáticamente al formulario los campos principales compatibles; planes, grupos y prestaciones se registran explícitamente desde el texto/tablas para evitar deducciones contractuales sin validar.
- Cada respaldo identifica documento, página y cita exacta. Al validar, DB comprueba pertenencia al cliente, página existente y presencia de la cita. La revisión humana debe comprobar que esa cita efectivamente respalda el valor; una coincidencia textual no demuestra por sí sola su interpretación contractual.
- Al guardar se crea otra versión inmutable. La primera versión/renovación validada tiene efecto desde su inicio; el endoso requiere fecha de efecto dentro de su vigencia y evidencia para esa fecha. La interfaz no elimina versiones anteriores.
- Un documento usado por una versión validada o movimiento no se reasigna ni se reprocesa. Para una corrección documental, cargar el nuevo original con contenido diferente y registrar otra versión.

## Cartera y reportes

Inicio de vigencia muestra la fecha más reciente entre pólizas validadas actualmente vigentes en America/Santiago. Los borradores, pólizas futuras, suspendidas, vencidas y canceladas no aportan esa fecha. El detalle conserva todas las fechas validadas. Una renovación futura no desplaza el contrato efectivo actual.

Los filtros de aseguradora/cobertura/estado deben coincidir dentro de una misma póliza. Se permite orden ascendente/descendente por fecha, prima mensual, KAM y razón social; nulos al final. Clientes sin primas aparecen con métricas ausentes.

La prima mensual y anual estimada conservan sus fórmulas históricas: último mes de sábana y ×12. Titulares/cargas suman Salud del último período y pueden repetir personas entre pólizas. Los términos de vigencia próximos son fechas verificadas, no renovaciones automáticas supuestas.

Las primas contractuales se muestran por póliza y sus componentes se conservan sin sumarlos otra vez al total. Facturación, cobros y ajustes son movimientos separados con evidencia y referencia única; las cifras de sábana no se convierten automáticamente en cobros. Las monedas se muestran por registro y no se suman entre sí.

Los reportes históricos siguen leyendo las mismas sábanas vigentes y las reglas existentes de cálculo. Los snapshots permiten revisar las cargas anteriores disponibles desde la instalación y conservar vínculos estables; no incorporan un nuevo selector de snapshot en los gráficos existentes ni recuperan datos de cargas antiguas ya sustituidas antes de instalar el módulo.

## Identidad, conciliación y permisos

Las importaciones mantienen los RPC y modalidades actuales. Antes de publicar, resuelven el RUT validado, nombre legado y alias, y guardan las filas con el nombre canónico que requieren los reportes. Un conflicto entre RUT y nombre se rechaza íntegramente. La instalación incorpora únicamente RUT válidos y sin conflictos desde las primas existentes; los casos ambiguos quedan pendientes y bloquean la creación de otro cliente con ese RUT. RUT ausente sigue permitido para legados; RUT informado pero inválido se rechaza. No se infiere RUT desde una póliza.

Cada publicación nueva conserva un snapshot inmutable; el mismo contenido no crea otra copia en una actualización sin cambios. Los vínculos se hacen a snapshot/fila/póliza/versión validada/cobertura, con asignación total máxima de 100%; no crean nuevas primas ni modifican el JSON histórico. Los movimientos usan UUID y referencia única para evitar duplicados.

Admin activo crea/edita y valida. KAM/jefe conservan lectura según las asignaciones y reglas RLS existentes. No se concede edición por un nombre importado. El KAM contractual se registra por póliza, separado del KAM/jefe históricos que siguen actualizándose desde la sábana. La asignación explícita de clientes nuevos se realiza con la pantalla existente Usuarios y clientes.

La auditoría registra actor, fecha y valores anteriores/nuevos de clientes, documentos (sin replicar su texto), versiones contractuales y movimientos; también registra cargas/vínculos. Los usuarios funcionales no pueden modificar el historial. Las lecturas del historial de auditoría se limitan a administradores.

## Reversión

Desactivar `VITE_PORTFOLIO_ADMIN_ENABLED=false` en frontend y recompilar; `PORTFOLIO_ADMIN_ENABLED=false` en backend y reiniciar. También se puede volver a los builds previos: las rutas y firmas históricas siguen siendo compatibles.

Opcionalmente aplicar `docs/REVERSIÓN_CARTERA.sql` para revocar escrituras de las funciones nuevas. No borra tablas, datos, evidencias ni originales y conserva RLS y snapshots. Para reactivar, aplicar `docs/REACTIVAR_CARTERA.sql` y habilitar las variables. No volver a ejecutar el SQL de instalación sobre una base ya instalada.

## Validaciones

Resultado final local: **63 pruebas Node/PGlite aprobadas**, compilación backend, chequeo TypeScript frontend y build frontend correctos. El SQL consolidado se aplicó en una base PGlite aislada; sus políticas Storage se comprobaron con un esquema simulado. También pasaron la prueba de navegador en escritorio/móvil y la extracción real de PDF digital/escaneado con Poppler/Tesseract. No se ejecutó ninguna migración en Supabase ni se desplegó producción.


La suite Node/PGlite cubre múltiples pólizas/coberturas, RUT/alias, vigencia efectiva, evidencias, páginas, conflictos de edición, renovaciones/endosos, snapshots, asignación máxima de filas, movimientos idempotentes, RLS y políticas Storage simuladas. El extractor se prueba con runner simulado y con Poppler/Tesseract reales sobre PDF digital y PDF escaneado sintéticos. También se comprobó en navegador la creación de clientes, edición de planes/grupos/condiciones, guardado de borradores, varias coberturas, revisión de PDF, filtros y vista móvil. Se deben probar originales autorizados y Storage/Auth reales en Supabase de desarrollo antes de producción.

```sh
# En backend (permiso para abrir servidor HTTP temporal en localhost)
node --import tsx --test --test-isolation=none tests/*.test.ts
npm run build
# En frontend
npx tsc --noEmit
npm run build
```

Pruebas opcionales de integración local:

```sh
# En backend, con Poppler/Tesseract e idiomas spa+eng disponibles
node --import tsx tests/pdf-local-smoke.mjs
# En frontend, con brave-browser (o BROWSER_BIN apuntando a Chromium)
node tests/browser-smoke.mjs
```

El harness de navegador usa exclusivamente fixtures sintéticos y un perfil temporal. No inicia sesión en Supabase ni consulta producción; no se incluye en el bundle de producción.

## Aviso del SQL Editor sobre RLS

El consolidado actualizado habilita RLS explícitamente después de crear cada una de sus ocho tablas. Se verificaron RLS y ausencia de permisos directos INSERT/UPDATE/DELETE para authenticated en PostgreSQL aislado, además de los casos de permisos existentes. La edición inicial lo hacía mediante SQL dinámico, que el analizador preventivo del editor podía no reconocer.

Si conservas una consulta pegada antes de esta corrección, cancela el cuadro de ejecución y reemplaza todo el texto por el archivo actualizado. La instalación no invoca el DELETE contenido en la definición del RPC de reemplazo; ese RPC conserva la modalidad de reemplazo existente para cuando se utiliza después desde la aplicación. La instalación sí añade estructuras y completa RUT históricos inequívocos, por lo que es una modificación del esquema y metadatos, aunque conserve sábanas y tablas.
