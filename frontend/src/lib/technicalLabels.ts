const labels:Record<string,string>={
  missing_policy_number:'Falta identificar la póliza de origen',ambiguous_insurer:'Número compartido entre aseguradoras',unknown_policy_number:'Póliza de origen no registrada',
  partially_allocated:'Asignación de fila incompleta',invalid_allocation:'Asignaciones inválidas',policy_number_conflict:'La póliza de origen contradice la asignación',
  link_version_or_coverage_conflict:'Vínculo incompatible con la versión o cobertura',row_company_conflict:'Empresa de origen inconsistente',row_company_rut_conflict:'RUT empresarial contradictorio',
  no_validated_version:'Falta una versión contractual validada',contract_changes_within_month:'Cambio dentro del mes: revisar fuentes y vigencia',partial_or_inactive_validity:'Vigencia parcial o no activa: revisar datos',
  ambiguous_contract_coverage:'Cobertura contractual duplicada',inferred_coverage_without_link:'Cobertura inferida pendiente de asignación verificada',coverage_not_contracted:'Cobertura no acreditada en el contrato',
  incomplete_or_unresolved_data:'Datos incompletos o sin resolver',insufficient_reconciliation:'Falta conciliación entre fuentes',completeness_not_manually_verified:'Falta validar completitud',
  expense_basis_unverified_or_mixed:'Base del gasto desconocida o incompatible entre fuentes',assumed_claims_basis_differs_from_evidence:'El supuesto de base contradice el respaldo',
  observation_does_not_start_at_contract_inception:'La selección no comienza con la vigencia',noncontiguous_observation:'Faltan meses consecutivos',mixed_or_partial_validity:'Vigencias incompatibles o parciales',
  incomplete_contractual_coverage_scope:'Selecciona todas las coberturas contratadas',insufficient_observed_months:'Historia insuficiente según los supuestos',missing_scenarios:'Faltan supuestos de proyección',
  expense_basis:'Base del gasto',completeness:'Completitud',partial_month:'Revisión de mes',coverage_ambiguity:'Revisión de cobertura',allocation:'Asignaciones',
  pending:'Pendiente',validated:'Validada',rejected:'Requiere corrección',invalid_amount:'Importe inválido',currency_not_comparable:'Monedas no comparables',
};
export const technicalLabel=(code:string)=>labels[code]??(code.startsWith('missing_or_invalid_')?'Falta un supuesto válido':'Revisar datos o supuestos de origen');
