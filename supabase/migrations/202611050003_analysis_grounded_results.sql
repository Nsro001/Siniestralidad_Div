-- ETAPA 4: contrato estructurado sin texto libre. Conserva validación v1 y políticas RLS.
-- Validación semántica de cifras y referencias: backend antes de finalizar y reutilizar.
begin;
create or replace function public.analysis_safe_result(value jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare item jsonb; ref jsonb; codes text[]; position integer := 0;
begin
  if value is null or jsonb_typeof(value)<>'object' then return false; end if;
  if value->>'schemaVersion'='analysis-result-v2' then
    if coalesce(value->>'kind','') not in ('monthly','conclusions') or
      (select count(*) from jsonb_object_keys(value))<>4 or exists(select 1 from jsonb_object_keys(value) k where k not in ('schemaVersion','kind','sections','recommendations')) or
      jsonb_typeof(value->'sections') is distinct from 'array' or jsonb_typeof(value->'recommendations') is distinct from 'array' then return false; end if;
    codes:=case when value->>'kind'='monthly' then array['monthly_result'] else array['technical_result','renewal_projection','action_plan'] end;
    if jsonb_array_length(value->'sections')<>cardinality(codes) or jsonb_array_length(value->'recommendations')>3 then return false; end if;
    for item in select * from jsonb_array_elements(value->'sections') loop
      position:=position+1;
      if jsonb_typeof(item)<>'object' then return false; end if;
      if (select count(*) from jsonb_object_keys(item))<>2 or exists(select 1 from jsonb_object_keys(item) k where k not in ('code','findings')) or item->>'code' is distinct from codes[position] or jsonb_typeof(item->'findings') is distinct from 'array' then return false; end if;
      if jsonb_array_length(item->'findings')>8 then return false; end if;
      for ref in select * from jsonb_array_elements(item->'findings') loop
        if jsonb_typeof(ref)<>'object' then return false; end if;
        if (select count(*) from jsonb_object_keys(ref))<>2 or exists(select 1 from jsonb_object_keys(ref) k where k not in ('ref','value')) or coalesce(ref->>'ref','') !~ '^(m[0-9]{1,3}([.]c[0-9]{1,2})?|r[0-9]{1,2})[.][a-zA-Z]{1,40}$' or jsonb_typeof(ref->'value') is distinct from 'number' then return false; end if;
      end loop;
      if (select count(distinct r->>'ref') from jsonb_array_elements(item->'findings') r)<>jsonb_array_length(item->'findings') then return false; end if;
    end loop;
    for item in select * from jsonb_array_elements(value->'recommendations') loop
      if jsonb_typeof(item)<>'object' then return false; end if;
      if (select count(*) from jsonb_object_keys(item))<>2 or exists(select 1 from jsonb_object_keys(item) k where k not in ('code','evidenceRef')) or item->>'code' is distinct from 'review_benefits' or coalesce(item->>'evidenceRef','') !~ '^m[0-9]{1,3}[.]c[0-9]{1,2}[.]differenceUf$' then return false; end if;
    end loop;
    if (select count(distinct r->>'evidenceRef') from jsonb_array_elements(value->'recommendations') r)<>jsonb_array_length(value->'recommendations') then return false; end if;
    return octet_length(value::text)<=8192;
  end if;
  if value->>'schemaVersion' is distinct from 'analysis-result-v1' or coalesce(value->>'kind','') not in ('monthly','conclusions')
    or exists(select 1 from jsonb_object_keys(value) k where k not in ('schemaVersion','kind','sections','recommendations')) then return false; end if;
  if jsonb_typeof(value->'sections') is distinct from 'array' or jsonb_typeof(value->'recommendations') is distinct from 'array' then return false; end if;
  if jsonb_array_length(value->'sections') not between 1 and 3 or jsonb_array_length(value->'recommendations')>3 then return false; end if;
  for item in select * from jsonb_array_elements(value->'sections') loop
    if jsonb_typeof(item)<>'object' then return false; end if;
    if exists(select 1 from jsonb_object_keys(item) k where k not in ('code','metricRefs')) or coalesce(item->>'code','') not in ('monthly_result','technical_result','renewal_projection','action_plan')
      or jsonb_typeof(item->'metricRefs') is distinct from 'array' then return false; end if;
    if jsonb_array_length(item->'metricRefs')>12 then return false; end if;
    for ref in select * from jsonb_array_elements(item->'metricRefs') loop
      if jsonb_typeof(ref)<>'string' or ref#>>'{}' not in ('premiumUf','technicalSpendUf','lossRatio','lossRatioDeltaPp','spendEffectPp','premiumEffectPp','reimbursementUf','differenceUf','renewalAdjustmentPercent') then return false; end if;
    end loop;
  end loop;
  for item in select * from jsonb_array_elements(value->'recommendations') loop
    if jsonb_typeof(item)<>'string' or item#>>'{}' not in ('review_benefits','education','preferred_providers','pharmacy_agreements','bioequivalents') then return false; end if;
  end loop;
  return octet_length(value::text)<=8192;
end;
$$;

commit;
