# Presentación y análisis conciso — 14 de noviembre de 2026

Corrección del sistema original, sobre 76be55e. No modifica importadores, primas, gastos, siniestralidad histórica ni tablas de negocio.

## Orden y comportamiento

- Presentación y PDF: portada, evolución, resumen y gráficos seleccionados; conclusiones y renovación al final.
- El análisis mensual no es una diapositiva inicial ni una apertura automática. Se solicita únicamente al seleccionar un mes en el gráfico o su selector accesible.
- Mes seleccionado: tres impactos cuantificados y tres acciones correctivas. El detalle técnico y la conciliación permanecen disponibles, plegados.
- Cierre: tres conclusiones descriptivas, escenario de renovación y tres acciones. Excel comienza con el mismo cierre aprobado, conservando la hoja de gastos original.
- Cargar una sábana no abre el análisis. El progreso y los controles de carga anteriores permanecen.

## Escenario técnico al 75 %

El 75 % es un objetivo solicitado, no un punto de equilibrio calculado de la aseguradora. El escenario requiere exactamente 12 meses consecutivos, todas las coberturas presentes, importes no negativos y primas y gasto total positivos. Filas presentes no acreditan por sí solas que una carga esté auditada.

Prima del escenario = gasto declarado del alcance / 0,75. Variación UF = prima del escenario − prima del período; variación % = variación / prima del período × 100. Es un escenario de gasto y exposición constantes, no una cotización ni una predicción de mercado. No incluye tendencia, desarrollo de siniestros, gastos administrativos, cambios de exposición ni condiciones de negociación: estos supuestos requieren revisión antes de adoptar una decisión.

Si la siniestralidad es inferior al 75 %, el margen de gasto adicional a prima constante es 0,75 × prima − gasto. Se recomienda solicitar una evaluación de mejora contractual y costo, con ese margen como techo; no se recomienda una cobertura específica ni se promete que se mantendrá la siniestralidad. La mejora es alternativa a la reducción de prima del escenario, no acumulable: bajar la prima hasta el objetivo consume ese margen. Si faltan datos, el escenario queda no disponible.

La distinción entre escenario descriptivo y tarificación prospectiva sigue la necesidad de considerar desarrollo, tendencia y gastos descrita en [CAS, Basic Ratemaking](https://www.casact.org/abstract/basic-ratemaking). No se añaden causalidades clínicas ni ahorros no medidos.

## Verificación local

- TypeScript frontend/backend y build Vite correctos.
- Suite original del candidato: 52 pruebas aprobadas; después, 6 pruebas focalizadas aprobadas incluyendo coincidencia del escenario en Excel.
- Navegador sintético: portada primero, cierre al final, cero solicitudes mensuales antes de seleccionar mes; tres impactos y tres acciones tras seleccionar, detalle plegado; carga de primas conserva el input y no abre análisis; PDF generado y cero solicitudes Gemini.
- PDF sintético verificado por extracción de texto: primera página portada.
- Primas, motores y hoja de datos de Excel originales conservados; nueva lógica solo en la capa narrativa y su presentación.

Gemini permanece apagado, límite cero. La publicación del frontend requiere sustituir los archivos estáticos en la raíz exclusiva de demo.noergon.cl, mediante el acceso cPanel del propietario. No incluir fuentes, respaldos ni credenciales en public_html. El ZIP contiene solo la distribución pública, permisos 0644 y carpeta assets 0755. La recuperación del frontend consiste en restaurar la distribución anterior; el backend puede volver al commit 76be55e, sin cambios de base de datos.
