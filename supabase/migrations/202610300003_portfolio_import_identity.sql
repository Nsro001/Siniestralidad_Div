-- Importaciones compatibles: misma API, identidad por RUT/alias, filas con nombre legado.
begin;
create table public.portfolio_client_aliases (
  alias_key text primary key,
  client_id uuid not null references public.clients(id) on delete restrict,
  original_name text not null,
  created_at timestamptz not null default now()
);
alter table public.portfolio_client_aliases enable row level security;
revoke all on public.portfolio_client_aliases from public,anon,authenticated;
grant select on public.portfolio_client_aliases to authenticated;
create policy portfolio_alias_read on public.portfolio_client_aliases for select to authenticated using(public.can_access_client(client_id));

create function public.portfolio_resolve_import_rows(source_rows jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare item jsonb; result jsonb := '[]'; title text; key text; canonical text; cid uuid; by_name uuid; by_rut uuid; current_rut text; rut_value text; matches integer; legacy_matches integer; legacy_id uuid;
begin
  if source_rows is null or jsonb_typeof(source_rows)<>'array' then raise exception 'Sábana inválida'; end if;
  for item in select distinct jsonb_build_object('clientName',r->>'clientName','clientRut',r->>'clientRut') from jsonb_array_elements(source_rows) r loop
    title:=trim(item->>'clientName'); key:=lower(title);
    if title is null or title='' then raise exception 'Cliente requerido'; end if;
    rut_value:=public.normalized_rut(item->>'clientRut');
    select id,rut into by_name,current_rut from public.clients where name=title;
    if by_name is null then
      select a.client_id,c.rut into by_name,current_rut from public.portfolio_client_aliases a join public.clients c on c.id=a.client_id where a.alias_key=key;
    end if;
    if by_name is null then
      select count(*),min(id::text)::uuid into matches,by_name from public.clients where lower(trim(coalesce(legal_name,name)))=key;
      if matches>1 then
        if rut_value is null then raise exception 'Razón social ambigua: informa RUT'; end if;
        by_name:=null;
      end if;
      select rut into current_rut from public.clients where id=by_name;
    end if;
    by_rut:=null;
    if rut_value is not null then select id into by_rut from public.clients where rut=rut_value; end if;
    if rut_value is not null and by_rut is null then
      select count(distinct c.id),min(c.id::text)::uuid into legacy_matches,legacy_id
        from public.clients c join public.client_datasets d on d.client_id=c.id
        cross join lateral jsonb_array_elements(d.rows) r
        where c.rut is null and d.kind='primas' and public.portfolio_try_rut(r->>'clientRut')=rut_value;
      if legacy_matches>1 then raise exception 'RUT ambiguo en sábanas históricas. Resuelve las identidades antes de importar'; end if;
      if legacy_matches=1 then by_rut:=legacy_id; end if;
    end if;

    if by_name is not null and ((by_rut is not null and by_rut<>by_name) or (current_rut is not null and rut_value is not null and current_rut<>rut_value)) then
      raise exception 'Conflicto entre RUT y nombre de cliente. Resuelve el duplicado antes de importar';
    end if;
    cid:=coalesce(by_rut,by_name);
    if cid is null then
      insert into public.clients(name,legal_name,rut) values(title,title,rut_value) returning id into cid;
    elsif rut_value is not null then
      update public.clients set rut=rut_value where id=cid and rut is null;
    end if;
    if exists(select 1 from public.portfolio_client_aliases where alias_key=key and client_id<>cid) then raise exception 'Alias de cliente ambiguo'; end if;
    insert into public.portfolio_client_aliases(alias_key,client_id,original_name) values(key,cid,title) on conflict(alias_key) do nothing;
    select name into canonical from public.clients where id=cid;

  end loop;
  select coalesce(jsonb_agg(jsonb_set(r.value,'{clientName}',to_jsonb(c.name)) order by r.ordinality),'[]'::jsonb) into result
    from jsonb_array_elements(source_rows) with ordinality r(value,ordinality)
    join public.portfolio_client_aliases a on a.alias_key=lower(trim(r.value->>'clientName'))
    join public.clients c on c.id=a.client_id;
  return result;
end;
$$;
-- Conservar implementaciones anteriores para reversión operativa controlada.
alter function public.import_client_dataset(text,jsonb) rename to portfolio_legacy_import_client_dataset;
alter function public.finish_dataset_upload(uuid) rename to portfolio_legacy_finish_dataset_upload;
-- PL/pgSQL califica parámetros con el nombre de la función; ajustar tras renombrar.
do $$ declare definition text; begin
  definition:=pg_get_functiondef('public.portfolio_legacy_finish_dataset_upload(uuid)'::regprocedure);
  execute replace(definition,'finish_dataset_upload.upload_id','portfolio_legacy_finish_dataset_upload.upload_id');
end $$;
revoke all on function public.portfolio_legacy_import_client_dataset(text,jsonb),public.portfolio_legacy_finish_dataset_upload(uuid),public.portfolio_resolve_import_rows(jsonb) from public,anon,authenticated;

create function public.import_client_dataset(dataset_kind text,dataset_rows jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise insufficient_privilege using message='Administrador requerido'; end if;
  lock table public.clients,public.client_datasets in share row exclusive mode;
  perform public.portfolio_legacy_import_client_dataset(dataset_kind,public.portfolio_resolve_import_rows(dataset_rows));
end;
$$;
create function public.finish_dataset_upload(upload_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare session public.dataset_uploads; chunk record;
begin
  if not public.is_admin() then raise insufficient_privilege using message='Administrador requerido'; end if;
  select * into session from public.dataset_uploads where id=upload_id for update;
  if not found or session.owner_id<>auth.uid() then raise insufficient_privilege using message='Carga no disponible'; end if;
  if session.completed then return; end if;
  lock table public.clients,public.client_datasets in share row exclusive mode;
  for chunk in select c.chunk_index,c.rows from public.dataset_upload_chunks c where c.upload_id=finish_dataset_upload.upload_id order by c.chunk_index loop
    update public.dataset_upload_chunks c set rows=public.portfolio_resolve_import_rows(chunk.rows)
      where c.upload_id=finish_dataset_upload.upload_id and c.chunk_index=chunk.chunk_index;
  end loop;
  perform public.portfolio_legacy_finish_dataset_upload(upload_id);
end;
$$;
-- replace conserva su contrato y usa la misma identidad normalizada para su conjunto incluido.
create or replace function public.replace_client_dataset(dataset_kind text,dataset_rows jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare prepared jsonb;
begin
  if not public.is_admin() then raise insufficient_privilege using message='Administrador requerido'; end if;
  lock table public.clients,public.client_datasets in share row exclusive mode;
  prepared:=public.portfolio_resolve_import_rows(dataset_rows);
  perform public.portfolio_legacy_import_client_dataset(dataset_kind,prepared);
  delete from public.client_datasets d where d.kind=dataset_kind and not exists(
    select 1 from jsonb_array_elements(prepared) r join public.clients c on c.name=r->>'clientName' where c.id=d.client_id);
  if dataset_kind='primas' then update public.clients c set kam_name=null,manager_name=null where not exists(select 1 from public.client_datasets d where d.client_id=c.id and d.kind='primas'); end if;
end;
$$;
revoke all on function public.import_client_dataset(text,jsonb),public.finish_dataset_upload(uuid) from public,anon;
grant execute on function public.import_client_dataset(text,jsonb),public.finish_dataset_upload(uuid) to authenticated;
commit;
