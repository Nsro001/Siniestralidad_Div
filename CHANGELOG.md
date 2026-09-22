
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
