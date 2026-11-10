-- Reversión operativa NO destructiva. No ejecutar junto al SQL de instalación.
-- Primero desactivar frontend (VITE_PORTFOLIO_ADMIN_ENABLED=false y recompilar)
-- y backend (PORTFOLIO_ADMIN_ENABLED=false y reiniciar), o volver a los builds previos.
-- Mantiene las lecturas/RLS, snapshots, auditoría, pólizas y originales privados.
-- Los RPC históricos de importación conservan nombre/firma y siguen operando.
begin;
revoke execute on function public.portfolio_save_client(uuid,integer,jsonb),
  public.portfolio_save_policy(uuid,uuid,integer,text,date,text,jsonb,text),
  public.portfolio_register_document(uuid,uuid,text,text),
  public.portfolio_update_document(uuid,uuid,text,jsonb,jsonb,text),
  public.portfolio_link_row(uuid,integer,uuid,text,numeric,uuid),
  public.portfolio_add_movement(uuid,uuid,uuid,jsonb) from authenticated;
select pg_notify('pgrst','reload schema');
commit;
