-- Ejecutar después de 202609170001_portfolio.sql.
begin;
create function public.replace_client_dataset(dataset_kind text, dataset_rows jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise insufficient_privilege using message = 'Administrador requerido'; end if;
  -- Serializa ambas modalidades de carga y revierte todo si la validación falla.
  lock table public.clients, public.client_datasets in share row exclusive mode;
  perform public.import_client_dataset(dataset_kind, dataset_rows);
  delete from public.client_datasets d where d.kind = dataset_kind
    and not exists (select 1 from jsonb_array_elements(dataset_rows) r
      join public.clients c on c.name = r->>'clientName' where c.id = d.client_id);
  if dataset_kind = 'primas' then
    update public.clients c set kam_name = null, manager_name = null
      where not exists (select 1 from public.client_datasets d where d.client_id = c.id and d.kind = 'primas');
  end if;
  -- Conserva las identidades y asignaciones; los reportes usan las sábanas vigentes.
end;
$$;
revoke all on function public.replace_client_dataset(text, jsonb) from public, anon;
grant execute on function public.replace_client_dataset(text, jsonb) to authenticated;
commit;
