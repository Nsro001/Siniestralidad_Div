# Análisis de prestaciones e IA bajo demanda — 14 de noviembre de 2026

Sobre el sistema original publicado en demo.noergon.cl; sin cambios en primas, gastos, cartera, siniestralidad histórica, importadores ni RLS.

## Valor del análisis

En el mes seleccionado, se agrupan los reembolsos positivos por prestación aplicando las exclusiones del motor original. Con una referencia común de meses anteriores cargados para todas las coberturas seleccionadas, se calcula el aporte UF de cada prestación a la variación. Se priorizan los aumentos cuando el neto aumenta y los descensos cuando baja; se identifican compensaciones, categorías nuevas y ausencia de base para porcentaje. Sin referencia común, solo se muestra concentración actual, sin inventar variaciones. Los tres impactos pueden incluir un aviso de evidencia faltante cuando no hay tres prestaciones cuantificables.

Las acciones se vinculan con las prestaciones identificadas y sus líneas del alcance: comparar tarifas y volumen registrado, revisar cuentas, repetición de líneas o rezagos según la categoría y el signo de la variación. No se equiparan líneas a atenciones únicas, no se atribuyen diagnósticos ni causalidad, no se presume ahorro y no se restringe atención clínica. El cierre distingue el gasto declarado de la sábana de primas y el reembolso del detalle, que pueden no conciliar. Conserva el escenario de renovación al 75 % y su alternativa condicionada de mejora contractual.

## IA

Botones “Analizar con IA” en el cierre y “Analizar mes con IA” únicamente dentro del mes seleccionado. No hay generación automática al cargar datos o abrir el informe. Gemini prioriza referencias de los indicadores, conclusiones y acciones calculados y validados por NOERGON; no redacta cifras nuevas ni modifica la proyección. La interfaz identifica el resultado como priorizado con IA.

Modelo fijo: gemini-3.1-flash-lite. Transporte solo backend, clave privada en variable de Render. El catálogo enviado no contiene nombres de empresa, asegurados, prestaciones, prestadores, documentos, RUT, fechas ni importes absolutos UF. Usa referencias genéricas, índices relativos y porcentajes redondeados; el texto visible se reconstruye en el backend. No se envían filas individuales ni conteos de personas.

El usuario autorizó indicadores agregados reales y luego confirmó expresamente el límite **por proceso**: máximo 10 solicitudes por día UTC, compartidas entre usuarios y clases de análisis. El contador se reinicia al reiniciar Render y esta limitación es visible. No es una cuota persistente global. Cada intento se reserva antes de la llamada; fallos y timeouts consumen cupo, no se reintentan. Timeout 15 s, límites de entrada/salida y validación estricta: exactamente tres indicadores, tres conclusiones y tres acciones referenciadas. Los resultados quedan en caché por actor y contexto durante 30 minutos. Sin tres indicadores respaldados, se bloquea la IA y se mantiene el análisis determinístico.

Google declara el modelo disponible en Free tier: [precios oficiales](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.1-flash-lite). La evidencia de proyecto sin facturación es la verificación manual expresa del propietario; el agente no tiene acceso Cloud Billing independiente. Se comprobó por GET de metadatos la disponibilidad de generateContent y que la clave privada coincide con la usada en la prueba sintética previa aprobada. No se efectuó una nueva generación real durante esta etapa.

Google puede utilizar entradas/salidas del nivel gratuito para mejorar productos y recomienda no enviar datos sensibles o confidenciales: [condiciones](https://ai.google.dev/gemini-api/terms#unpaid-services). La minimización anterior evita transferir información comercial identificable o datos individuales de salud. No se habilita facturación ni se cambia ningún plan.

## Verificación y recuperación

Pruebas de aportes UF positivos/negativos, categoría nueva, acciones específicas, catálogo sin nombres/importes absolutos, rechazo de dos indicadores, concurrencia/cuota simuladas, caché por actor/contexto, Excel y rutas autenticadas. Navegador: portada primero, cierre al final, mes solo al seleccionar, tres impactos/acciones y una llamada simulada exclusivamente al pulsar IA. Fuentes de motores y detalle de Excel conservados.

Recuperación: deshabilitar NOERGON_GEMINI_REAL_ENABLED, fijar cuota cero y retirar la clave; restaurar la distribución estática anterior si fuese necesario. Volver al backend 1a36bc7 no requiere SQL. No modificar main ni el segundo servicio Render. El ZIP actualizado exige subida manual por el propietario a la raíz exclusiva de demo.noergon.cl; no existe acceso de subida configurado para el agente.
