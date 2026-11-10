# Administración de cartera: auditoría y propuesta

Este documento conserva el diagnóstico previo a la implementación. El estado y las instrucciones del módulo implementado están en `docs/ADMINISTRACION_CARTERA.md`.

Fecha: 30 de octubre de 2026. Alcance: código y seis migraciones del repositorio; sin conexión a producción, sin inspección de datos reales y sin ejecución de migraciones. El esquema desplegado debe contrastarse con esta propuesta antes de implementarla.

## Diagnóstico comprobado

| Área | Situación actual y evidencia | Consecuencia |
| --- | --- | --- |
| Frontend | React 18, TypeScript, Vite, Tailwind y Recharts. `frontend/src/AuthApp.tsx` alterna cartera, reportes, usuarios y contraseña. | Incorporar una vista de administración y conservar la navegación a reportes. |
| Cartera | `frontend/src/components/PortfolioDashboard.tsx`: búsqueda por nombre y filtro KAM; columna Último mes; sin filtros contractuales ni ordenamiento seleccionable. | Hace falta ampliar API, tipos y pantalla. |
| Backend | Express/TypeScript; `backend/src/app.ts`: sesión obligatoria, cargas Excel/CSV solo admin, endpoints de reportes y cartera. | No hay CRUD contractual ni extracción PDF/OCR. |
| Clientes | `clients(id,name,created_at,kam_name,manager_name)`; nombre único. Los importadores resuelven identidad por nombre. | No hay RUT maestro, razón social independiente, contactos ni estado de cartera. |
| Primas y gastos | `client_datasets`: una fila por `(client_id,kind)`; filas procesadas JSONB, períodos y coberturas. | No son un libro de movimientos con identificadores estables. Una recarga sustituye el dataset del cliente/tipo. |
| Pólizas | `PremiumRow.policy` y `ExpenseRow.policy`, ambos texto opcional. | No hay entidad póliza, aseguradora, vigencia ni FK contractual. |
| Indicadores | `backend/src/portfolio.ts`: prima mensual = suma del último período del cliente; anual estimada = mensual × 12; titulares/cargas = Salud de ese período. | Conservar fórmulas y rotular fuente, período y carácter estimado. No representan un censo único de personas. |
| Renovaciones | Se calculan por aniversario del primer mes de primas. `renewalDate` se parsea pero no se usa en este cálculo. | No deben convertirse en fechas contractuales ni renovaciones confirmadas. |
| Permisos | `profiles`: admin, executive, manager; asignaciones explícitas y coincidencia de nombres de KAM/jefe mediante `can_access_client`. | El nombre importado influye en el acceso; no modificar esa semántica sin transición probada. |
| KAM/jefe | Trigger `sync_portfolio_metadata` toma el último período de primas y actualiza `clients`. | La edición manual podría ser sobrescrita por una nueva carga. Separar asignación contractual y dato importado. |
| Reportes | Primas, gastos, comparaciones anuales, detalle mensual, conclusión, asegurados y exportación Excel; cliente seleccionado por nombre y filtrado también dentro del JSON. | Renombrar solo `clients.name` puede dejar filas históricas fuera de los cálculos. Mantener nombre legado hasta adaptar lectores. |
| Marca | `report_branding` depende de `clients.id` y contiene logos y corredor de presentación. | El corredor de presentación no acredita al corredor contractual. |
| Almacenamiento | Staging SQL por chunks, con recibos e idempotencia; el repositorio no define bucket privado de pólizas. | Las cargas actuales no conservan originales PDF ni originales de sábanas como archivo. |
| Tipos | `shared/types.ts` difiere de los modelos efectivos de backend/frontend. | Consolidar contratos nuevos sin reemplazar tipos históricos a ciegas. |

Las migraciones `replace_dataset` y `chunked_dataset_upload` permiten retirar datasets de clientes ausentes en modalidad reemplazo; preservan clientes y asignaciones. Esto es comportamiento existente, pero no constituye un archivo histórico inmutable. Antes de ampliar importaciones hay que añadir versiones y conservar el comportamiento visible actual.

El parser puede clasificar planes desconocidos como Salud y convertir valores numéricos no interpretables en cero. No reutilizar esas reglas como validación contractual. Dato ausente, cero, no aplicable y dato pendiente deben distinguirse.

## Relaciones que deben conservarse

- `auth.users → profiles → client_assignments → clients`, con los mismos UUID y permisos actuales.
- `clients → client_datasets` y sus claves `(client_id,kind)`, períodos, coberturas y filas JSON sin reescritura masiva.
- `clients → report_branding`, conservando logos y configuración.
- `auth.users → dataset_uploads → dataset_upload_chunks`, sus RPC y cargas atómicas.
- Contratos actuales de filtros y reportes por nombre hasta disponer de adaptación compatible por UUID.

## Modelo propuesto

PostgreSQL relacional para identidad, relaciones, fechas, importes y reglas consultables; JSONB acotado a estructuras variables y resultados de extracción. Los campos contractuales desconocidos permanecen nulos. Borrado lógico para entidades de negocio y FKs restrictivas en las nuevas relaciones.

| Entidad | Campos y relaciones principales |
| --- | --- |
| `clients` (ampliación) | Mantener `id` y `name`; añadir `legal_name`, `rut_normalized` nullable, `portfolio_status`, datos comerciales y control de versión. RUT normalizado con DV validado; unicidad parcial para RUT informado. |
| `client_aliases`, `client_contacts` | Alias de nombres de importación y contactos por cliente; los alias ambiguos requieren resolución humana. |
| `insurers`, `brokers` | Catálogos de aseguradoras y corredores con identidad propia; sin derivarlos de logos. |
| `policies` | Identidad de la póliza: cliente, aseguradora, número como texto preservando ceros, corredor, KAM contractual y estado administrativo. |
| `policy_versions` | Póliza, número de versión, tipo inicial/renovación/endoso, predecesora, vigencia desde/hasta, efecto del cambio, estado borrador/validada, autor y validación. Versiones aprobadas inmutables. |
| `policy_coverages` | Versión de póliza, tipo Vida/Salud/Dental/Catastrófico u otro documentado, nombre original y vigencia particular si corresponde. |
| `coverage_plans`, `coverage_groups`, `plan_group_assignments` | Planes por cobertura y grupos por versión; asociación explícita de grupos a planes sin duplicar condiciones. |
| `plan_benefits`, `benefit_limits`, `deductibles`, `coverage_conditions` | Prestaciones, porcentajes, capitales, topes y deducibles; ámbito individual/familiar, unidad, período, evento y condiciones. Varias reglas por plan o prestación. |
| `premium_terms`, `commission_terms` | Prima o tasa, moneda, periodicidad, base de cálculo, grupo/plan opcional, vigencia, comisión porcentual y su base documentada. Nivel póliza o componente, con regla para evitar sumar totales y desgloses simultáneamente. |
| `policy_documents`, `document_pages` | Cliente, póliza/versión opcional, objeto privado, hash, nombre, tipo, páginas, texto y coordenadas. Documento pendiente puede no tener cliente resuelto; acceso solo al propietario autorizado/admin hasta vincularlo. |
| `extraction_jobs`, `extracted_fields`, `field_evidence` | Estado de procesamiento, versión del extractor; campo propuesto, valor original/normalizado, página, región, método y revisión. Una condición puede tener varias evidencias. |
| `contract_field_sources` | Vincula campos guardados con evidencias y persona que validó; conservar valor propuesto y corrección. Entrada manual exige referencia documental para aprobar datos contractuales. |
| `dataset_versions`, `dataset_source_rows` | Snapshot inmutable de cada publicación y filas identificables por versión/ordinal, hash y procedencia. Preservar las filas actuales tal cual. |
| `policy_row_links` | Vínculos revisados entre fila de snapshot y póliza/versión/cobertura; sin FK a posición mutable del JSON vigente. Admitir ausencia o ambigüedad de vínculo. |
| `premium_movements` | Movimientos futuros identificados: facturación, cobro, ajuste; fecha, período, moneda, importe y clave de origen. La sábana actual no prueba por sí sola un cobro efectivo. |
| `audit_events` | Actor, operación, entidad, versión anterior/nueva, fecha y correlación; escritura desde DB, lectura restringida y sin modificación por usuarios funcionales. |

Los importes usan `numeric`, las fechas contractuales `date` y los eventos `timestamptz`. Validar orden de fechas, porcentajes 0–100 y coherencia entre entidades del mismo cliente mediante FKs compuestas o restricciones equivalentes. No sumar CLP, UF y USD sin una conversión explícita con fuente y fecha. El estado temporal de vigencia se deriva para la fecha consultada en America/Santiago y considera cancelaciones/endosos efectivos; no depende de un booleano que queda obsoleto.

La clave de duplicados de pólizas debe distinguir aseguradora, cliente y número; las renovaciones se registran como versiones, no nuevos duplicados. Confirmar con muestras si existen reutilizaciones legítimas de numeración antes de imponer la restricción definitiva. No fusionar clientes ni asignar aseguradoras desde el número de póliza.

### Contenido por cobertura

- Vida: prestaciones de fallecimiento, muerte accidental e invalidez solo cuando consten; capital y su fórmula, tasas y bases, edades de ingreso/permanencia, exclusiones.
- Salud: prestaciones de reembolso, porcentajes, topes y capital máximo; deducibles individuales/familiares, reglas BMI según definición del documento, farmacias, convenios, beneficios, primas y condiciones especiales.
- Dental: prestaciones, porcentajes, topes/capital, deducibles, primas, carencias y prestadores.
- Catastrófico: capital, deducible, alcance, activación, exclusiones y primas.

No crear prestaciones preseleccionadas como si fueran contratadas. Cada dato se publica después de validar su evidencia. Un endoso conserva las condiciones anteriores y sus fechas de efecto; no sobrescribe retrospectivamente la versión vigente histórica.

## Comportamiento de la cartera

1. `Inicio de vigencia`: máximo inicio entre pólizas verificadas vigentes en la fecha de consulta, considerando la versión efectiva. Si no hay, mostrar «Sin póliza vigente» o «Sin información contractual» según corresponda; nunca usar meses de primas como sustituto.
2. Mostrar todas las pólizas y fechas en detalle: aseguradora, número, cobertura, inicio, término y estado; incluir históricas y futuras identificadas como tales.
3. Orden ascendente/descendente por inicio, prima mensual, KAM y razón social; nulos al final y desempate estable por UUID. Filtros por aseguradora, cobertura y estado, manteniendo búsqueda/KAM. Si se combinan aseguradora y cobertura, deben coincidir en una misma póliza.
4. Mantener prima mensual de sábana y anual estimada ×12, identificando período y fuente; primas contractuales y cobros verificados van en métricas separadas. No duplicar el monto total de una póliza por cada cobertura.
5. Mantener titulares/cargas de Salud, indicando que su suma por póliza puede contar a la misma persona varias veces. Los clientes nuevos sin primas deben aparecer con importes y cantidades ausentes, sin alterar la selección histórica de reportes.
6. Renovaciones contractuales basadas en fechas/condiciones verificadas. Conservar la estimación anterior claramente separada durante la transición; no asumir renovación automática desde la fecha de término.

## Formularios y API

Vista Administración de Cartera por UUID, con siete pestañas: Datos del cliente; Pólizas y aseguradoras; Vida; Salud; Dental; Catastrófico; Documentos y renovaciones. Las pestañas de cobertura permiten seleccionar póliza y versión; no concentran todas las pólizas en un único formulario plano.

API propuesta bajo `/portfolio/clients` y `/policies`: crear/editar cliente, gestionar borradores/versiones y validar publicación. Endpoints separados para subir documento, consultar trabajo de extracción, revisar campos y confirmar importación. Validación en servidor y DB, transacciones, claves de idempotencia y control de versión para evitar sobrescribir ediciones concurrentes. Mantener `/portfolio` y reportes compatibles durante la transición.

Permisos iniciales: admin administra y valida; executive/manager conservan lectura autorizada actual. Si se habilita edición por KAM, agregar capacidad explícita por cliente y operaciones, sin inferirla de una coincidencia de nombre. Toda tabla hija y objeto privado aplica autorización por cliente en DB; impedir que IDs de otro cliente se introduzcan en una escritura autorizada.

## Extracción privada de PDF

Flujo: carga privada → validación de tipo/tamaño/páginas → hash y detección de repetición → texto/tablas por página → OCR local para páginas sin texto suficiente → propuestas de campos → revisión junto a la página → validación → publicación transaccional.

Evaluar en una prueba local herramientas autoalojadas como PDF.js para texto/coordenadas, extracción tabular y Tesseract con rasterización aislada para OCR. La elección final depende de PDF reales y calidad medida; no se presupone una extracción universal de tablas. Probar documentos digitales, escaneados, mixtos y protegidos, y diferentes aseguradoras. Procesar en workers con límites de memoria/tiempo y sin bloquear Express.

No enviar originales, texto, imágenes ni campos a servicios externos. Un eventual servicio externo requiere autorización explícita previa. Bucket privado, rutas internas aleatorias y acceso firmado breve previa autorización; sin URLs públicas ni contenidos documentales en logs. Texto OCR y derivados conservan la misma protección que el original.

Cada propuesta muestra página, fragmento/tabla y estado de revisión. Dato ausente queda pendiente, sin completar por costumbre del mercado. Duplicados: RUT validado para clientes; aseguradora/cliente/número y versión para pólizas; hash para documentos; importaciones repetidas con resultado idempotente. Conflictos se resuelven antes de publicar.

## Migraciones compatibles y reversión

No editar las seis migraciones históricas. Preparar nuevos archivos ordenados, cada uno con precondiciones, aplicación transaccional cuando sea posible, validación y procedimiento de reversión.

| Lote | Cambio propuesto | Reversión sin pérdida |
| --- | --- | --- |
| A | Columnas opcionales en clients, alias, catálogos y snapshots de datasets. | Desactivar lectores nuevos; conservar columnas/tablas y datos. |
| B | Pólizas, versiones, coberturas, planes, grupos y condiciones. | Retornar a cartera anterior mediante bandera; conservar contratos registrados. |
| C | Documentos privados, extracción y procedencia. | Detener workers/cargas nuevas y mantener originales/evidencias privados. |
| D | RLS, funciones de escritura y auditoría de las entidades nuevas. | Revocar funciones nuevas tras desactivar UI; no retirar controles de acceso de datos conservados. |
| E | Relaciones con movimientos, índices, vistas de cartera y API ampliada. | Revertir selección de vistas/API; conservar snapshots y asociaciones. |
| F | Resolver importación por RUT/alias y edición por UUID mediante versión nueva de RPC. | Restaurar versión anterior de la aplicación/RPC con snapshots disponibles; no deshacer cambios de identidad automáticamente. |

La reversión operativa no debe hacer DROP de tablas nuevas pobladas. Un rollback físico de objetos vacíos puede prepararse para desarrollo; retirar datos poblados requeriría aprobación y respaldo. Antes de cada despliegue: comparar esquema real, respaldo y restauración probada en entorno aislado. Ningún backfill deriva vigencia desde primas, ni inventa RUT o aseguradora.

Mantener `clients.name` y su restricción durante la transición. Introducir razón social editable y alias sin romper ON CONFLICT(name) de importadores. RUT único parcial solo después de revisar conflictos; los legados quedan nulos hasta validación. Un snapshot inicial conserva lo actualmente disponible, pero no recupera cargas antiguas ya sustituidas.

## Plan y criterios de aceptación

1. Auditoría y base de referencia: contrastar esquema desplegado, confirmar semántica de primas, obtener PDF de prueba autorizados y documentar cálculos/permisos existentes. Sin cambios en producción.
2. Fundación contractual: lotes A/B/D en entorno aislado, formularios de cliente y pólizas, RUT y permisos. Aceptación: un cliente con dos aseguradoras y una póliza con cuatro coberturas; datos ausentes permanecen ausentes; lectura y escritura cruzada bloqueadas.
3. Cartera: nueva fecha desde pólizas, detalle de fechas, filtros y orden; conservar importes/asegurados y mostrar nuevos clientes sin primas. Aceptación: fechas vigentes, vencidas y futuras, empates/nulos, combinaciones de filtros, límites de fecha y zona horaria.
4. Detalle: planes, grupos y condiciones de las cuatro coberturas. Aceptación: varios topes y deducibles por prestación, monedas distintas, capitales/fórmulas y evidencia de cada dato aprobado.
5. PDF: lote C, extracción local, OCR, revisión y guardado. Aceptación: digital/escaneado/mixto, tablas multipágina, campos contradictorios, correcciones, duplicados, errores del worker y ningún tráfico documental externo.
6. Conciliación e historia: lotes E/F; versionar cargas, vincular pólizas sin duplicar filas y separar contractual/sábana/facturado/cobrado/estimado. Aceptación: recargas, ajustes negativos, renovación con igual número, endoso retroactivo, concurrencia e idempotencia; reportes históricos con los mismos resultados para las mismas filas/filtros.
7. Despliegue controlado: respaldo, piloto autorizado, bandera del módulo, validación de permisos y reversión probada. Producción únicamente con aprobación.

Pruebas: ampliar Node test/PGlite para relaciones, transacciones y RLS; integración real en Supabase de prueba para Storage/Auth y URLs firmadas; pruebas de interfaz para formularios, selección de pólizas, ordenamiento y revisión PDF. Fixtures sintéticos de contratos sin datos personales reales. No basta con pruebas del parser para asegurar condiciones contractuales.

## Verificación ejecutada

- TypeScript sin emisión: backend y frontend finalizan correctamente.
- `npm test` en backend: 11 archivos pasan y `tests/access.test.ts` falla. La ejecución aislada también falla; el runner devuelve `ERR_TEST_FAILURE` y salida 1 sin detallar la causa interna. No se atribuye una causa no demostrada ni se considera aprobada la validación de acceso.
- No se modificó código funcional, no se ejecutaron migraciones y no se accedió a producción. Único archivo añadido: este diagnóstico.
