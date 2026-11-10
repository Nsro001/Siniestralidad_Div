# Qué actualizar en Supabase

La regla definitiva de contratos sin primas totales y la extracción/tarificación local **no requieren migraciones nuevas**. Si Cartera ya está instalada, no vuelvas a ejecutar `ADMINISTRACION_CARTERA_COMPLETO.sql`. La API conserva la compatibilidad enviando `premium: ""` a la RPC histórica. No borres columnas, tablas, históricos ni datos de sábanas.

No se inspeccionó ni modificó el proyecto remoto. Para identificar qué tienes instalado, ejecuta únicamente el diagnóstico de lectura `docs/COMPROBAR_SUPABASE_CARTERA.sql`.

## Según el resultado

- Si los tres pasos de Cartera están instalados: no hay SQL adicional para clientes, pólizas, extracción avanzada o exclusión de totales.
- Si Cartera no está instalada: aplica una sola modalidad — `supabase/ADMINISTRACION_CARTERA_COMPLETO.sql`, o las tres migraciones `202610300001` → `202610300002` → `202610300003`. Requieren las seis migraciones históricas hasta `202610160001`. No combines modalidades ni ejecutes el consolidado sobre una instalación parcial; revisa los pasos faltantes.
- Si utilizarás las funcionalidades técnicas de las etapas 3 a 5 y sus pasos faltan, las migraciones locales correspondientes son `202611050001_analysis_persistence.sql` → `202611050002_portfolio_technical_reviews.sql` → `202611050003_analysis_grounded_results.sql` → `202611050004_analysis_display_provenance.sql`. Aplica solo las pendientes y en ese orden. La revisión técnica (`002`) depende de Cartera y es independiente de activar IA. El diagnóstico detecta objetos principales y no sustituye revisar que una instalación parcial haya terminado correctamente.

Conserva RLS y el bucket `portfolio-policies` privado. No actives proveedores, cuotas ni facturación: Gemini permanece deshabilitado. Los archivos de migración no se ejecutan por subir el repositorio a GitHub mediante este flujo.

La extracción avanzada requiere actualizar el código del backend/frontend por el proceso de despliegue que autorices y disponer de Poppler y Tesseract `spa+eng` en el backend. Esto no se resuelve con una modificación de Supabase; en esta entrega no se despliega producción.
