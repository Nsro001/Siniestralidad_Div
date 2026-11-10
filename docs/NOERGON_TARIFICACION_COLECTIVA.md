# NOERGON — Tarificación colectiva y prima total opcional

> Regla vigente: [Contratos sin primas totales](NOERGON_CONTRATOS_SIN_TOTALES.md). Las descripciones de prima total opcional y subtotales de este informe corresponden a una implementación anterior y quedan reemplazadas.

Ajuste local del 10 de noviembre de 2026. Se conserva el módulo y sus etapas técnicas. No hay despliegues ni migraciones remotas; Gemini sigue deshabilitado y los PDF no se envían a proveedores externos.

## Prima total y fuentes técnicas

`PolicyContract.premium` representa exclusivamente un total contractual declarado. Su ausencia es legítima: en el formato compatible con las RPC se guarda como `""`. La API también acepta el campo omitido o nulo y lo normaliza a cadena vacía, sin inventar un importe. No se necesita respaldo de prima total cuando no hay un total declarado.

Se elimina `premium` de los campos obligatorios del diagnóstico de extracción. `extractionReview.optionalAbsent` informa su ausencia sin convertirla en error. La interfaz explica que un contrato colectivo puede tener primas variables. Se conserva la prima total si realmente se declara y se distingue de subtotales individuales y estimaciones.

Las primas por persona/categoría, tasas e impuestos se almacenan como condiciones de tarificación. No rellenan `PolicyContract.premium`, no generan movimientos de primas ni alteran sábanas. Los motores siguen tomando `premiumUf` de sus fuentes de primas registradas. Una prueba de comportamiento confirma que cambiar el total contractual y añadir una tarifa arbitraria no cambia la prima observada del indicador.

No se implementó un cálculo sobre nóminas. No se producen primas estimadas ni calculadas sin nómina y regla validadas. Un texto que identifica una prima como estimada/calculada no se incorpora como total contractual declarado. No hay un motor nuevo que sustituya las fuentes técnicas existentes.

## Esquema de datos

Se aprovecha el JSON contractual existente, sin tablas nuevas:

| Ubicación | Significado |
|---|---|
| `PolicyContract.premium` | Total declarado opcional; `""` significa ausencia legítima |
| `PageText.contractCandidates[]` | Propuestas con cobertura, plan, grupo, página, cita y región |
| `ContractCandidate.kind` | `tariff`, `rate` o `capital`, separados de deducibles, topes y reembolsos |
| `ContractCandidate.tariff` | Descripción tipada de la regla de tarificación |
| `ContractTerm.tariff` | La misma descripción, persistida dentro de cobertura → plan → condiciones |
| `ContractTerm.evidence` | Documento, página, cita literal y región opcional del valor |
| `tariff.contextEvidence[]` | Fragmentos que explicitan moneda, base o frecuencia de la tabla |

`ContractTariff` conserva:

- `concept`: prima por persona, prima por grupo familiar, tarifa por plan/categoría, tasa aplicada al capital, capital asegurado o impuesto.
- `component` y `componentLabel`: neto/afecto, bruto, impuesto o no indicado, conservando la etiqueta original.
- `category`, `ageBand`, `incomeBand`: categoría y tramos explícitos; no se confunde el tramo monetario de renta con la moneda de la prima.
- `currency`, `rateUnit`, `periodicity`, `calculationBasis`: independientes de las selecciones generales del formulario; vacíos cuando el contrato no los indica.
- `capitalBasis`: monto fijo, múltiplo de renta o no indicado. La expresión de renta se conserva sin convertirla en UF ni calcular un capital.
- `subtotal`: identifica un subtotal de la tabla de tarifas, incluso si la fila se titula “Prima Total”. No lo transforma en total de toda la póliza.

El valor y su unidad siguen en `value` y `unit`, con notas, alternativas y estado de revisión. Se validan los tipos de metadatos y la coherencia de la unidad de tasa con la unidad del valor. Se conservan porcentaje, por mil y otras unidades explícitas, sin conversiones.

## Extracción y edición

El lector de cuadrículas reconoce columnas Prima Neta/Afecta, IVA y Prima Bruta, tanto en tablas por fila como en tablas transpuestas por tramo. Las tasas y capitales existentes se enriquecen con su base y unidad, manteniéndolos separados de las primas individuales. Una fórmula de capital por tasa solo se registra si está escrita en el documento; no se presupone.

Las tablas de tarificación son editables por cobertura y categoría en la revisión documental y en los planes del contrato/borrador. Conservan el enlace a la página original. La revisión documental mantiene el visor con región resaltada. La incorporación al borrador conserva los metadatos, fuentes y alternativas. Reimportar no pisa correcciones: puede enriquecer una condición anterior que todavía no tenía metadatos de tarificación.

La ausencia de prima total no bloquea la validación. Eso no desactiva las comprobaciones de identidad, vigencias, evidencia ni ambigüedades de tarifas/tasas. Una unidad o frecuencia desconocida permanece vacía y advertida; el revisor puede reconocer la ausencia, pero no se habilita un cálculo inventado.

## Comparación con las referencias

Las tres pólizas siguen sin requerir un total contractual fijo. Ese resultado deja de figurar como error de extracción.

| Caso | Antes de este ajuste | Resultado del ajuste |
|---|---|---|
| Consorcio | Tasas/capitales como condiciones generales; ausencia de total reportada entre faltantes | 8 tasas netas/brutas anuales y 4 capitales con metadatos; unidad de tasa no especificada permanece vacía |
| Vida Cámara Vida | Tabla de primas por titular sin condiciones monetarias estructuradas | 15 celdas de primas/IVA, incluyendo 3 subtotales individuales; además 4 tasas y 4 capitales enriquecidos |
| Vida Cámara Salud | Primas por categorías y tramos sin incorporación estructurada | 30 celdas de primas/IVA: 9 de categorías de Salud, 12 de tramos de renta de padres y 9 de Dental |

Los recuentos son de celdas, no de pólizas, personas ni primas totales. Neto, IVA y bruto son componentes separados: no deben sumarse entre sí como tres primas. Los subtotales individuales tampoco se suman otra vez con sus componentes.

## Verificación por valor

Se transcribió manualmente una muestra dirigida de 65 celdas de seis páginas originales: Consorcio 6/7, Vida 4/7 y Salud 8/17. La comprobación compara valor, moneda, frecuencia, unidad de tasa y marca de subtotal. La referencia y los resultados detallados permanecen fuera del repositorio en `/tmp/noergon-phase2-private`.

- Valores: 65/65 coincidentes, sin errores, ausencias ni alternativas contradictorias en los campos anotados.
- Moneda: coinciden las 53 primas/IVA/capitales monetarios en UF; las 12 tasas no reciben una moneda inventada.
- Frecuencia: coinciden las 45 celdas mensuales y las 8 tasas anuales; los 8 capitales y las 4 tasas sin frecuencia indicada permanecen sin frecuencia de tarificación.
- Unidad de tasa: 4 tasas por mil correctamente identificadas; las 8 tasas de Consorcio sin unidad explícita permanecen sin unidad. Los otros 53 campos no reciben una unidad de tasa.
- Se conservan correctamente los 3 subtotales individuales de Vida Cámara Vida como subtotales de tarifa.

La coincidencia de la muestra no es una precisión global ni una evaluación ciega: se utilizó durante el desarrollo y no tiene segundo anotador independiente. Las asignaciones ambiguas de planes, bases y categorías deben revisarse; no se presenta esta evaluación como una validación de todos los contratos.

Los múltiplos de renta, otras unidades y categorías no presentes en esta muestra se prueban con documentos/estructuras sintéticas. No se afirma que estas tres referencias contengan todas esas variantes.

## Ejemplos y privacidad

Los ejemplos reales incluyen la fila de subtotal por titular, las primas por grupo familiar, los tramos de renta en pesos con primas en UF y las tasas anuales sin unidad declarada. Se entregan en el informe privado temporal `tariff-examples.md`, con página, cita y metadatos observados. No se publican valores contractuales ni documentos originales en el repositorio.

Ejemplo sintético del esquema persistido:

```json
{
  "label": "Titular con una carga · Prima bruta",
  "value": "1,20",
  "unit": "UF",
  "period": "mensual",
  "tariff": {
    "concept": "family_premium",
    "component": "gross",
    "componentLabel": "Prima Bruta",
    "category": "Titular con una carga",
    "currency": "UF",
    "rateUnit": "",
    "calculationBasis": "según número de cargas",
    "periodicity": "mensual",
    "ageBand": "",
    "incomeBand": "",
    "capitalBasis": "",
    "subtotal": false
  },
  "evidence": { "documentId": "UUID del documento", "page": 1, "quote": "Titular con una carga   1,20 UF" }
}
```

La prima total del contrato permanece vacía aunque se incorporen estas reglas. La captura pública `validation/noergon-tariff-review.png` utiliza exclusivamente datos sintéticos.

## Pruebas y límites

Resultado: **176 pruebas backend correctas**, TypeScript y builds frontend/backend correctos. Smoke real PDF digital/OCR/protegido y navegador aprobados; también pasó la regresión específica de importes estimados con decimal. Permanecen los avisos previos de Vite por tamaño de bundle y Browserslist antiguo.

Se añaden regresiones para ausencia de total (API y RPC SQL local), subtotal individual, familias, componentes neto/IVA/bruto, tasas por mil/porcentaje/otra unidad, capital en UF y múltiplo de renta, tramos transpuestos, enriquecimiento de borradores y uso de primas observadas por los motores. Se mantiene el smoke PDF digital/OCR/protegido y el recorrido de navegador comprueba edición y persistencia de categoría de tarifa.

Siguen vigentes los límites geométricos y de OCR de la fase 2. Si no hay un plan inequívoco, una categoría explícita, una fórmula, una unidad o una frecuencia, no se inventan: se conserva la propuesta para revisión. No se garantiza extraer todos los modelos posibles de tarificación ni se calculan cobros reales. No se alteraron contratos validados históricos ni las RPC remotas.

## Archivos del ajuste

- `shared/portfolio.d.ts`: esquema `ContractTariff` y semántica de prima total opcional.
- `backend/src/policyTariffs.ts`: extracción y enriquecimiento de primas, tasas y capitales.
- `backend/src/policyConditions.ts`, `policyPdf.ts`, `policyInterpretation.ts`: integración, separación de conceptos y diagnóstico.
- `backend/src/contracts.ts`: normalización del total ausente y validación de tarificación.
- `frontend/src/components/TariffReviewTable.tsx`, `ContractExtractionReview.tsx`, `PolicyContractForm.tsx`, `PolicyDocumentReview.tsx`: tablas editables y mensajes.
- `frontend/src/lib/contractCandidates.ts`: persistencia y enriquecimiento sin sobrescribir correcciones.
- Pruebas de tarifas, SQL local y navegador; evaluador `scripts/evaluate_policy_tariffs.mjs`; documentación y captura sintética.

No se modificaron motores técnicos, reportes, esquemas remotos ni servicios externos. El workspace conserva los cambios previos.
