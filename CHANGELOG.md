
## 2026-09-05
- Se agregó resumen ejecutivo inicial.
- Se agregó consolidado Salud + Dental + Catastrófico.
- Se agregó conteo de titulares con uso y cargas con uso.
- Se agregaron filtros:
  - Vigencia actual
  - Últimos 12 meses
  - Todo
  - Personalizado
- Se agregó soporte de período corto para reportes.
- Pendiente:
  - rediseño del resumen ejecutivo en PDF con 3 indicadores circulares.
  - tabla compacta de titulares y cargas.
  - optimización visual A4.

## 2026-09-05 — Rediseño del resumen ejecutivo
- Tres indicadores circulares: Consolidado S+D+C, Salud y Dental, con porcentaje dentro y cobertura/período corto debajo.
- Tabla compacta de titulares y cargas con uso; se conserva el número de períodos y la nota sobre la necesidad de un censo.
- Se conserva la tabla de Prima UF, Gasto UF y Siniestralidad y sus cálculos.
- Estilos de impresión A4 con márgenes de 12 mm, círculos en tres columnas y tabla sin ancho mínimo en impresión.
- Validación: build de frontend correcto; TypeScript correcto con --types vite/client; renderizado estático verificado con datos de ejemplo, períodos desordenados y datos ausentes.
- El chequeo TypeScript sin --types vite/client detecta la declaración faltante de ImportMeta.env en api.ts, ajena a este cambio.
- Pendiente: revisión visual del PDF con datos reales y optimización A4 del resto de los reportes.

## 2026-09-05 — Ajuste de legibilidad
- Indicadores centrados con mayor separación y período corto bajo cada cobertura (Nov 2024 to Oct 2025).
- Titulares y cargas en tabla de dos columnas, centrada y de ancho compacto.
- Tabla financiera conservada.
- El despliegue anterior no se activó: el push requiere autenticación de GitHub en el equipo.

## 2026-09-05 — Sistema de usuarios y asignación de clientes
- Login y cierre de sesión con Supabase Auth; cambio de contraseña desde la cuenta.
- Administración de ejecutivos: creación, nombre, activación/desactivación y asignación de varios clientes.
- Backend con verificación de sesión y roles en cada solicitud; filtros y reportes restringidos por cliente mediante RLS.
- Sábanas persistentes en PostgreSQL por cliente/tipo, sin modificar los cálculos ni el resumen PDF.
- El dashboard recupera clientes guardados al entrar y descarta respuestas obsoletas al cambiar los filtros.
- Migración SQL, ejemplos de configuración y guía SETUP_SUPABASE.md para Supabase, Render y Vercel.
- Pruebas locales de permisos PostgreSQL y acceso HTTP aprobadas; builds y TypeScript aprobados.
- Prueba de navegador con servicios simulados aprobada: login, creación/asignación de ejecutivo, logout, cambio de contraseña, desactivación, reporte/PDF y vista móvil.
- Se verificó que Supabase acepta la clave pública; la tabla profiles aún no existe y el registro público sigue habilitado.
- Pendiente: aplicar la migración y configuración en servicios, crear el primer administrador y verificar con cuentas reales antes de publicar.

## 2026-09-22 — Comparación anual del reporte
- Siniestralidad mensual: línea del mismo mes del año anterior, intervalos identificados y detalle del mes comparado en el tooltip. Sin prima válida no se grafica un porcentaje cero.
- Distribución: UF y participación del período anterior, variación relativa del gasto UF y flechas para cambios estrictamente mayores a ±2 %. Entre ambos límites se muestra un guion; sin historia suficiente no se calcula variación.
- Tabla comparativa a todo el ancho y sin límite de altura al imprimir; disponible también en la presentación.
- Validación: compilación backend/frontend y TypeScript correctos; pruebas de comparación, detalle mensual y cartera aprobadas. Las sábanas corregidas permiten comparar nov. 2024–oct. 2025 con nov. 2023–oct. 2024 para los tres clientes.
- Cambios locales; carga de sábanas y despliegue pendientes.

## 2026-09-29 — CSV y publicación atómica por chunks
- Soporte formal CSV UTF-8 con detección de coma/punto y coma, BOM y campos entre comillas; reutiliza los parsers de primas/gastos y mantiene XLS/XLSX.
- Selector frontend admite CSV y lo recomienda para gastos grandes; límite de archivo de 30 MB (datos procesados: 25 MB).
- Nueva migración con staging privado, validación de administrador/propietario, chunks idempotentes y publicación transaccional. Conserva RPC existentes, RLS, asignaciones y metadatos de cartera.
- Backend envía hasta 500 filas/512 KiB por RPC y reintenta errores transitorios. El cierre verifica integridad y conserva recibos para reintentos; no modifica datos vigentes ante cargas incompletas.
- Pruebas nuevas de CSV, reintentos, fallos intermedios, rollback, permisos e importación de 25.473 filas sintéticas. Finalización local con PGlite: 213 ms; no representa una medición en Supabase.
- Validación: build de backend y frontend correctos; suite completa de 20 tests aprobada (prueba HTTP con permiso de puerto local); pruebas ampliadas de límite por bytes y respuesta de cierre perdida aprobadas.
- Pendiente: aplicar migración, desplegar y comprobar la carga real en Supabase.

## 2026-09-29 — Menor consumo de memoria al leer CSV grandes
- El CSV facilitado tiene 62 columnas, 25.472 filas de datos (25.473 con encabezado), separador punto y coma y 15.613.695 bytes; su formato es válido.
- El parser anterior retenía todas las celdas del CSV y alcanzó 540 MiB RSS en la prueba local, compatible con un posible agotamiento de memoria en un servidor de 512 MB. Los logs aportados son de Supabase y no confirman un reinicio de Render.
- Lectura mediante generador y transformación en bloques de 250 registros, sin conservar la tabla completa de celdas. Cede el control entre bloques y evita concatenaciones carácter a carácter.
- El límite de 25 MiB procesados se calcula por fila, sin serializar la sábana completa. Se mantienen validaciones y RPC de chunks.
- Pruebas de regresión con 25.472 filas sintéticas/62 columnas y heap de 128 MiB, errores al final del CSV y límite de tamaño. El archivo real no se incorpora al repositorio.
- Validación: build backend correcto, 23 tests aprobados y carga HTTP local del CSV real con respuesta 200, 25.472 filas y 51 chunks (Supabase simulado). Hash de todas las filas idéntico al parser anterior.
- Sin cambios SQL: no volver a ejecutar la migración. Pendiente confirmar carga en producción con el backend actualizado.

## 2026-09-29 — Fechas CSV con año de dos dígitos
- Corregida la lectura de fechas locales `dd/mm/aa` y `dd-mm-aa`: `01/02/25` se interpreta como febrero de 2025. Antes caía en `Date` y se interpretaba como enero, agrupando los meses incorrectamente.
- Años cortos: 00–49 corresponden a 2000–2049 y 50–99 a 1950–1999. Se mantiene la validación de días/bisiestos y el soporte de años completos, ISO y serial Excel.
- Validación con el CSV actual: la comparación enero–octubre de 2025/2024 queda completa para INTERANDINA y JUANITO PEREZ. POOL TRIPER comienza en julio de 2024 y carece realmente de enero–junio de 2024.
- Build backend y 25 tests aprobados, incluidas regresiones de doce meses, comparación anual, primas y renovación.
- Es necesario volver a cargar el archivo tras desplegar: el cambio de parser no modifica los períodos ya persistidos. No requiere SQL nuevo.
