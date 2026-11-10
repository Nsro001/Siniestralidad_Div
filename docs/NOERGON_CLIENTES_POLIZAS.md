# NOERGON — Clientes y pólizas

> Regla vigente: [Contratos sin primas totales](NOERGON_CONTRATOS_SIN_TOTALES.md). Las descripciones de prima total opcional y subtotales de este informe corresponden a una implementación anterior y quedan reemplazadas.

Implementación incremental local, 10 de noviembre de 2026. No se ejecutaron migraciones remotas ni despliegues. No se activaron servicios de pago. Gemini sigue deshabilitado. Los PDF del usuario se leyeron desde sus rutas originales y no se incorporaron al repositorio.

## Diagnóstico y alcance

La base existente es React/Vite, Express/TypeScript y Supabase. Ya dispone de contratos versionados, evidencia por página, RLS por cliente, originales privados, snapshots y auditoría. La interfaz anterior dividía las coberturas en pestañas principales; el extractor rechazaba cualquier cifrado y limitaba a 40 páginas, insuficientes para el caso Consorcio (52).

Se conserva esa base y los motores/reportes existentes. No hay SQL nuevo para este rediseño; requiere la instalación de cartera previamente prevista en el proyecto.

## Comportamiento implementado

- Panel NOERGON con cinco secciones: Cliente, Pólizas, Coberturas, Documentos y Revisión. Guía de seis pasos con indicador de posición, diseño responsive y coberturas dinámicas. Los indicadores técnicos siguen disponibles desde Revisión.
- Coberturas y planes siguen perteneciendo a una póliza; varias pólizas siguen perteneciendo al mismo cliente. Se pueden añadir coberturas manualmente si constan en el documento.
- Guardado progresivo en servidor de versiones de borrador después de 2,5 segundos sin cambios, una vez seleccionado el cliente y completados número y aseguradora. No usa almacenamiento del navegador para documentos o contratos. El cliente nuevo se guarda explícitamente antes de la póliza; datos sin identidad contractual suficiente permanecen en el formulario hasta completarlos.
- Identificación de cliente existente por RUT normalizado al incorporar campos revisados. Los candidatos contradictorios no se incorporan automáticamente. La asociación exige permisos de administrador.
- Revisión de campos básicos pendientes y evidencias, con validación final en el servidor. Borradores no desplazan contratos validados ni habilitan análisis que exigen datos verificados.
- Al cargar un original nuevo se inicia la extracción local; los duplicados se recuperan sin reprocesar automáticamente. Los fallos conservan el original y permiten reintentar, incluyendo contraseña de apertura cuando haga falta.
- Lectura local con Poppler; tablas preservadas como filas de texto; OCR Tesseract spa+eng. Candidatos de identidad, fechas numéricas y españolas, periodicidad, códigos CMF, coberturas y condiciones, con página y cita. Clasificación por encabezados de carátula, condiciones, anexos y beneficios.
- Prima total solo se propone desde una etiqueta explícita; prima por asegurado tiene otro campo candidato. Tasas y movimientos cobrados no se convierten en prima contractual.
- PDF con copia restringida: se intenta renderizado permitido y OCR; no se modifica el original ni se cambia su cifrado. Si el lector rechaza el archivo, la operación falla con un mensaje. PDF con contraseña: entrada opcional durante la solicitud; no se persiste ni se registra, se borra del formulario al terminar. No hay fuerza bruta ni descifrado alternativo.
- Límite de 20 MB, 80 páginas, 200.000 caracteres por página, 8 MiB de caracteres extraídos en total, cinco minutos comprobados entre páginas, 45 segundos por comando y un procesamiento concurrente por proceso. Imágenes de OCR eliminadas después de cada página; directorio temporal eliminado al finalizar o fallar.
- Puerto `LocalDocumentInterpreter` para una futura implementación local independiente del hosting. No está conectado a un modelo ni a una red; valida que las citas devueltas existan en la página. Su futura implementación necesita límites y evaluación específicos.

## Resultados con los documentos proporcionados

92 páginas digitales procesadas, sin OCR necesario. La referencia de cobertura es la indicada por el usuario, no una anotación completa de todos los campos.

| Caso | Páginas | Coberturas candidatas | Precisión / exhaustividad de tipos esperados | Campos básicos no detectados |
|---|---:|---|---|---|
| Consorcio | 52 | Vida, Salud, Dental | 3/3 y 3/3 | Aseguradora, moneda |
| Vida Cámara Vida | 14 | Vida | 1/1 y 1/1 | Periodicidad, moneda |
| Vida Cámara Salud | 26 | Salud, Dental | 2/2 y 2/2 | Periodicidad, moneda |

Estas proporciones comparan conjuntos de tipos mencionados. No acreditan límites, prestaciones o existencia contractual validada de cada cobertura.

| Campo | Documentos con candidato | Observación |
|---|---:|---|
| Razón social | 3/3 | Conflicto de candidatos en Consorcio y Vida; revisión necesaria |
| RUT de contratante | 3/3 | Coincidencia contextual; DV e identidad se validan al guardar |
| Aseguradora | 2/3 | No detectada en Consorcio |
| Número | 3/3 | Varios candidatos en ambos documentos Vida Cámara |
| Inicio / término | 3/3 cada uno | Candidatos con cita; no confirmados automáticamente |
| Prima total opcional | 0/3 | Ausencia legítima en estos contratos; no es error ni requisito de validación |
| Periodicidad | 1/3 | Detectada en Consorcio |
| Moneda explícita | 0/3 | No se infiere desde menciones aisladas de UF |
| Códigos CMF | 3/3 | Puede haber varios códigos legítimos por cobertura; revisar asociación |

La precisión por valor de campo no está medida: falta un conjunto de valores anotados y verificados independientemente. “Detectado” no significa “correcto” ni “validado”. `scripts/evaluate_policy_pdfs.mjs` reproduce estas métricas sin imprimir nombres, RUT, números ni citas. Orden de argumentos: Consorcio, Vida Cámara Vida, Vida Cámara Salud.

## Verificación

- Suite backend completa final: 152 pruebas correctas, incluido el caso adicional de documento incompleto. Incluye RLS, API, contratos, motores, reportes y aislamiento; los casos HTTP requieren localhost habilitado.
- Pruebas nuevas de restricciones de copia, entrega transitoria de contraseña, límites, separación de primas, conflictos y rechazo de evidencia inventada.
- Smoke real con Poppler, Tesseract y Ghostscript: PDF digital, escaneado, cifrado con copia restringida, apertura sin contraseña/incorrecta/válida. Fixtures exclusivamente sintéticos y temporales. Ghostscript es una dependencia de esta prueba, no del procesamiento de producción.
- Navegador Brave: creación de cliente, selección de póliza, edición de planes/grupos/condiciones, guardado manual y progresivo de borrador, múltiples coberturas, revisión documental, indicadores, filtros, escritorio y móvil sin desbordamiento.
- TypeScript frontend y backend, y builds de ambas aplicaciones correctos. Vite mantiene aviso por tamaño del bundle principal y base Browserslist antigua.

Capturas sintéticas: `validation/noergon-clientes-desktop.png` y `validation/noergon-clientes-mobile.png`.

## Límites pendientes

Las tablas son reconstrucciones desde espacios del texto, no una segmentación geométrica garantizada. No se asignan automáticamente todas las prestaciones, grupos, beneficiarios, edades, exclusiones o condiciones a planes: el usuario los revisa y registra con evidencia. Las menciones de cobertura pueden proceder de exclusiones o referencias y necesitan confirmación. Los encabezados pueden quedar sin clasificar o incluir varias secciones.

Las tres pólizas reales no requieren contraseña y no son escaneadas: esas variantes se probaron con documentos sintéticos. La extracción no está completa. No se declara validado ningún contrato del usuario. La integración real con Supabase remoto no se probó ni se modificó; las pruebas de esquema y RLS son locales. La interfaz de modelo local es un punto de extensión, no un modelo instalado. No hay decisiones de despliegue, servicios o migraciones pendientes de aprobación en esta entrega local.

## Archivos de esta intervención

- `frontend/src/components/PortfolioAdministration.tsx`: panel, navegación, revisión, identificación y borradores progresivos.
- `frontend/src/components/PolicyDocumentReview.tsx`: contraseña transitoria, ausencias/conflictos y revisión por página.
- `frontend/src/api.ts`: contraseña opcional en la solicitud de extracción.
- `frontend/src/styles.css`: presentación responsive NOERGON.
- `backend/src/policyPdf.ts`: lectura, OCR, recursos y candidatos documentales.
- `backend/src/portfolioAdmin.ts`: paso de contraseña al lector local.
- `backend/src/policyInterpretation.ts`: puerto local y métricas de candidatos.
- `shared/portfolio.d.ts`: clasificación opcional de páginas.
- `backend/tests/contracts.test.ts`, `backend/tests/policy-document.test.ts`, `backend/tests/pdf-local-smoke.mjs`: validación documental.
- `frontend/tests/browser-smoke.mjs`: recorrido actualizado, borradores progresivos y capturas.
- `scripts/evaluate_policy_pdfs.mjs`, este informe y capturas sintéticas.

El workspace ya contenía numerosos cambios previos, incluidos archivos aún no versionados; esta lista describe la intervención, no todo el estado de `git status`.

La continuación de extracción avanzada y su evaluación por campo se documentan en [NOERGON_EXTRACCION_FASE2.md](NOERGON_EXTRACCION_FASE2.md). Este informe conserva el estado de la fase 1.

La [actualización de tarificación colectiva](NOERGON_TARIFICACION_COLECTIVA.md) aclara que la ausencia de prima total es legítima y documenta las primas por categoría y tasas separadas de las primas registradas.
