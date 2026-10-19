# NOERGON — Frontend Design Skill v1.0

## Objetivo
Diseñar y modernizar interfaces empresariales NOERGON con una identidad consistente, accesible, rápida y orientada a tareas. Aplicable a web corporativa, analítica de siniestralidad y cotizadores.

## Identidad
- Lema: Creamos sistemas que potencian negocios.
- Estilo: tecnología empresarial sobria; evitar futurismo genérico, efectos excesivos y datos ficticios en producción.
- Colores: navy #0B1426, superficie oscura #152640, azul #2563EB, celeste #38BDF8, fondo claro #F8FAFC, texto claro #F8FAFC.
- Tipografía: Inter o fuente sans-serif disponible localmente; escala tipográfica consistente.
- Espaciado: escala 4/8/12/16/24/32 px; radios 8/12/16 px.

## Reglas de interfaz
1. Mantener jerarquía clara: título, descripción breve, acción principal, contenido.
2. Priorizar legibilidad de datos: cifras tabulares, unidades explícitas, ejes etiquetados y formatos locales de Chile.
3. Usar componentes reutilizables: Button, Card, KPI, DataTable, FilterBar, FormField, EmptyState, LoadingState, ErrorState.
4. Aplicar contraste WCAG AA, navegación con teclado, foco visible y etiquetas accesibles.
5. Responsive: escritorio, tablet y móvil; tablas anchas con desplazamiento horizontal o vistas adaptadas.
6. Animaciones discretas y respetar prefers-reduced-motion.
7. No copiar diseños de terceros ni usar logos, clientes, certificaciones o testimonios inventados.
8. No cambiar lógica de negocio, API, autenticación, RLS, datos ni fórmulas sin aprobación y pruebas.

## Flujo de implementación
1. Auditar rutas, componentes, dependencias, CSS, capturas y flujos actuales.
2. Crear rama git `design/noergon-v1`; no modificar producción directamente.
3. Definir tokens, componentes base y pantallas piloto.
4. Migrar pantalla por pantalla con pruebas de regresión y comparación visual.
5. Validar accesibilidad, rendimiento, responsive y permisos por rol.
6. Publicar primero preview de Vercel; aprobar antes de producción.

## Aplicación por producto
- Siniestralidad: sidebar, encabezado, KPIs, filtros, evolución mensual, tablas, comparativas y exportación; nunca alterar cifras o cálculos.
- Cotizador: pasos, validaciones, resumen, cotización PDF y envío; mantener reglas comerciales.
- Web corporativa: portada, servicios, productos, demos, cotizador, metodología y contacto.

## Checklist de aceptación
- [ ] No hay errores de compilación ni consola.
- [ ] Se conservan rutas, sesiones y permisos.
- [ ] Datos, filtros, cálculos y exportaciones coinciden con la versión anterior.
- [ ] Funciona en móvil y escritorio.
- [ ] Foco, contraste, etiquetas y estados de error revisados.
- [ ] Preview aprobada antes del despliegue.
