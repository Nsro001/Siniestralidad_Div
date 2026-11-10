"""Genera el entregable de Supabase desde las migraciones versionadas, sin ejecutarlo."""
from pathlib import Path
import re
root = Path(__file__).resolve().parents[1]
files = [root / 'supabase/migrations' / name for name in (
    '202610300001_portfolio_contracts.sql',
    '202610300002_portfolio_storage.sql',
    '202610300003_portfolio_import_identity.sql',
)]
header = '''-- ADMINISTRACIÓN DE CARTERA — SQL CONSOLIDADO
-- Generado por scripts/build_portfolio_sql.py. No editar esta copia manualmente.
-- Contiene TODOS los cambios nuevos de Supabase de esta implementación.
-- Requiere las seis migraciones históricas, hasta 202610160001 inclusive.
-- Aplicar UNA vez: este archivo O las tres migraciones nuevas, nunca ambos.
-- La instalación conserva tablas y sábanas; crea snapshots y completa RUT históricos inequívocos.
-- El DELETE está dentro del RPC de reemplazo existente: no se ejecuta al instalar.
-- Las ocho tablas nuevas habilitan RLS con instrucciones explícitas.
-- Usar el proyecto actual según la guía del usuario; verificar un respaldo restaurable.
-- Reversión operativa: docs/REVERSIÓN_CARTERA.sql (conserva datos y originales).
-- Instrucciones completas: docs/ADMINISTRACION_CARTERA.md.
begin;
select pg_advisory_xact_lock(hashtext('siniestralidad_portfolio_20261030'));
do $$ begin
  if current_setting('server_version_num')::integer<150000 then raise exception 'Se requiere PostgreSQL 15 o superior para las vistas con RLS del invocador'; end if;
  if to_regclass('public.report_branding') is null
    or to_regprocedure('public.finish_dataset_upload(uuid)') is null
    or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='report_branding' and column_name='interior_logo') then
    raise exception 'Faltan migraciones históricas; aplicar hasta 202610160001 antes de continuar';
  end if;
  if to_regclass('public.portfolio_policies') is not null then
    raise exception 'Administración de Cartera ya existe o se aplicó una migración individual. No ejecutar dos veces';
  end if;
end $$;
'''
sections = [header]
for path in files:
    source = re.sub(r'^(?:begin|commit);\s*$', '', path.read_text(), flags=re.MULTILINE)
    sections.append(f'\n-- ORIGEN: {path.name}\n{source}\n')
sections.append("select pg_notify('pgrst','reload schema');\ncommit;\n")
(root / 'supabase/ADMINISTRACION_CARTERA_COMPLETO.sql').write_text(''.join(sections))
