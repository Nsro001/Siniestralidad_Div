-- Solo para reactivar después de REVERSIÓN_CARTERA.sql; no reinstalar migraciones.
-- Los RPC siguen comprobando administrador activo en DB.
begin;
grant execute on function public.portfolio_save_client(uuid,integer,jsonb),
  public.portfolio_save_policy(uuid,uuid,integer,text,date,text,jsonb,text),
  public.portfolio_register_document(uuid,uuid,text,text),
  public.portfolio_update_document(uuid,uuid,text,jsonb,jsonb,text),
  public.portfolio_link_row(uuid,integer,uuid,text,numeric,uuid),
  public.portfolio_add_movement(uuid,uuid,uuid,jsonb) to authenticated;
select pg_notify('pgrst','reload schema');
commit;
-- Reactivar variables y recompilar/reiniciar después de validar permisos.
