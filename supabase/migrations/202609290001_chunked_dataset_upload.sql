-- Después de 202609230001_replace_dataset.sql. No cambia tablas/políticas de lectura.
begin;
create table public.dataset_uploads (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('primas', 'gastos')),
  replace_all boolean not null,
  expected_chunks integer not null check (expected_chunks between 1 and 10000),
  expected_rows integer not null check (expected_rows > 0),
  completed boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.dataset_upload_chunks (
  upload_id uuid not null references public.dataset_uploads(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  rows jsonb not null check (jsonb_typeof(rows) = 'array'),
  primary key (upload_id, chunk_index)
);
alter table public.dataset_uploads enable row level security;
alter table public.dataset_upload_chunks enable row level security;
-- Staging privado: ni siquiera authenticated puede leer/escribir tablas directamente.
revoke all on public.dataset_uploads, public.dataset_upload_chunks from public, anon, authenticated;

create function public.begin_dataset_upload(upload_id uuid, dataset_kind text, replace_all boolean,
  expected_chunks integer, expected_rows integer)
returns void language plpgsql security definer set search_path = '' as $$
declare previous public.dataset_uploads;
begin
  if not public.is_admin() then raise insufficient_privilege using message = 'Administrador requerido'; end if;
  if upload_id is null or dataset_kind is null or dataset_kind not in ('primas', 'gastos')
    or replace_all is null or expected_chunks is null or expected_chunks not between 1 and 10000
    or expected_rows is null or expected_rows < 1 or expected_rows > expected_chunks * 500 then
    raise exception 'Carga inválida';
  end if;
  -- Caducidad de staging y recibos. No toca las sábanas publicadas.
  delete from public.dataset_uploads where created_at < now() - interval '7 days';
  insert into public.dataset_uploads(id, owner_id, kind, replace_all, expected_chunks, expected_rows)
    values (upload_id, auth.uid(), dataset_kind, replace_all, expected_chunks, expected_rows)
    on conflict (id) do nothing;
  select * into previous from public.dataset_uploads where id = upload_id for update;
  if previous.owner_id <> auth.uid() then raise insufficient_privilege using message = 'Carga ajena'; end if;
  if previous.kind <> dataset_kind or previous.replace_all <> replace_all
    or previous.expected_chunks <> expected_chunks or previous.expected_rows <> expected_rows then
    raise exception 'Identificador de carga reutilizado con otros datos';
  end if;
end;
$$;

create function public.append_dataset_upload_chunk(upload_id uuid, chunk_index integer, chunk_rows jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare session public.dataset_uploads; previous jsonb;
begin
  if not public.is_admin() then raise insufficient_privilege using message = 'Administrador requerido'; end if;
  select * into session from public.dataset_uploads where id = upload_id for update;
  if not found or session.owner_id <> auth.uid() then raise insufficient_privilege using message = 'Carga no disponible'; end if;
  if session.completed then raise exception 'Carga ya finalizada'; end if;
  if chunk_index is null or chunk_index < 0 or chunk_index >= session.expected_chunks
    or chunk_rows is null or jsonb_typeof(chunk_rows) <> 'array' then raise exception 'Chunk inválido'; end if;
  if jsonb_array_length(chunk_rows) not between 1 and 500 or octet_length(chunk_rows::text) > 1048576 then
    raise exception 'Chunk demasiado grande o vacío';
  end if;
  if exists (select 1 from jsonb_array_elements(chunk_rows) r
    where jsonb_typeof(r) <> 'object' or coalesce(trim(r->>'clientName'), '') = ''
      or coalesce(r->>'period', '') !~ '^\d{4}-(0[1-9]|1[0-2])$'
      or coalesce(trim(r->>'coverage'), '') = '') then
    raise exception 'Filas sin cliente, período o cobertura válidos';
  end if;
  select c.rows into previous from public.dataset_upload_chunks c
    where c.upload_id = append_dataset_upload_chunk.upload_id and c.chunk_index = append_dataset_upload_chunk.chunk_index;
  if found then
    if previous <> chunk_rows then raise exception 'Chunk repetido con contenido distinto'; end if;
    return;
  end if;
  insert into public.dataset_upload_chunks values (upload_id, chunk_index, chunk_rows);
end;
$$;

create function public.finish_dataset_upload(upload_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare session public.dataset_uploads; chunk_count integer; row_count bigint; included_clients uuid[];
begin
  if not public.is_admin() then raise insufficient_privilege using message = 'Administrador requerido'; end if;
  select * into session from public.dataset_uploads where id = upload_id for update;
  if not found or session.owner_id <> auth.uid() then raise insufficient_privilege using message = 'Carga no disponible'; end if;
  if session.completed then return; end if;
  select count(*), sum(jsonb_array_length(c.rows)) into chunk_count, row_count
    from public.dataset_upload_chunks c where c.upload_id = finish_dataset_upload.upload_id;
  if chunk_count <> session.expected_chunks or row_count <> session.expected_rows then
    raise exception 'Carga incompleta';
  end if;
  -- Mismo orden de locks que replace_client_dataset; también serializa importaciones antiguas.
  lock table public.clients, public.client_datasets in share row exclusive mode;
  insert into public.clients(name)
    select distinct r->>'clientName' from public.dataset_upload_chunks c
      cross join lateral jsonb_array_elements(c.rows) r
      where c.upload_id = finish_dataset_upload.upload_id
    order by 1 on conflict (name) do nothing;
  -- Una agrupación, sin concatenación creciente ni búsquedas correlacionadas en el JSON.
  with published as (
    insert into public.client_datasets(client_id, kind, rows, periods, coverages)
    select cl.id, session.kind, jsonb_agg(r.value order by c.chunk_index, r.ordinality),
      array_agg(distinct r.value->>'period' order by r.value->>'period'),
      array_agg(distinct r.value->>'coverage' order by r.value->>'coverage')
    from public.dataset_upload_chunks c
      cross join lateral jsonb_array_elements(c.rows) with ordinality r(value, ordinality)
      join public.clients cl on cl.name = r.value->>'clientName'
    where c.upload_id = finish_dataset_upload.upload_id group by cl.id
    on conflict (client_id, kind) do update set rows = excluded.rows, periods = excluded.periods,
      coverages = excluded.coverages, updated_at = now()
    returning client_id
  ) select array_agg(client_id) into included_clients from published;
  if session.replace_all then
    delete from public.client_datasets d where d.kind = session.kind and not (d.client_id = any(included_clients));
    if session.kind = 'primas' then
      update public.clients cl set kam_name = null, manager_name = null
        where not exists (select 1 from public.client_datasets d where d.client_id = cl.id and d.kind = 'primas');
    end if;
  end if;
  update public.dataset_uploads set completed = true where id = upload_id;
  -- El recibo permite reintentar finish cuando se pierde la respuesta HTTP.
  delete from public.dataset_upload_chunks c where c.upload_id = finish_dataset_upload.upload_id;
end;
$$;
revoke all on function public.begin_dataset_upload(uuid, text, boolean, integer, integer),
  public.append_dataset_upload_chunk(uuid, integer, jsonb), public.finish_dataset_upload(uuid) from public, anon;
grant execute on function public.begin_dataset_upload(uuid, text, boolean, integer, integer),
  public.append_dataset_upload_chunk(uuid, integer, jsonb), public.finish_dataset_upload(uuid) to authenticated;
commit;
