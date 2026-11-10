-- Solo lectura. Ejecutar en el SQL Editor del proyecto actual para identificar pasos pendientes.
select 'Cartera base (202610300001)' paso,
  to_regclass('public.portfolio_policies') is not null instalado
union all select 'Storage privado (202610300002)',
  exists(select 1 from storage.buckets where id='portfolio-policies' and not public)
union all select 'Identidad de importaciones (202610300003)',
  to_regclass('public.portfolio_client_aliases') is not null
union all select 'Persistencia analítica (202611050001)',
  to_regclass('public.analysis_runtime_policy') is not null
union all select 'Revisiones técnicas (202611050002)',
  to_regclass('public.portfolio_technical_reviews') is not null
union all select 'Resultados estructurados v2 (202611050003)',
  case when to_regprocedure('public.analysis_safe_result(jsonb)') is null then false
    else position('analysis-result-v2' in pg_get_functiondef(to_regprocedure('public.analysis_safe_result(jsonb)')))>0 end
union all select 'Procedencia de caché (202611050004)',
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='analysis_cache' and column_name='origin');
