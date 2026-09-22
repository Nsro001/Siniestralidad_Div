-- Ejecutar una vez en SQL Editor del proyecto Supabase.
begin;
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default '',
  role text not null default 'executive' check (role in ('admin', 'executive')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) > 0),
  created_at timestamptz not null default now()
);
create table public.client_assignments (
  user_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  primary key (user_id, client_id)
);
create index client_assignments_client_idx on public.client_assignments(client_id);
-- Una sábana procesada por cliente/tipo: conserva los campos del parser y cálculos.
create table public.client_datasets (
  client_id uuid not null references public.clients(id) on delete cascade,
  kind text not null check (kind in ('primas', 'gastos')),
  rows jsonb not null check (jsonb_typeof(rows) = 'array'),
  periods text[] not null default '{}',
  coverages text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (client_id, kind)
);
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();
insert into public.profiles (id, email, full_name)
select id, coalesce(email, ''), coalesce(raw_user_meta_data ->> 'full_name', '') from auth.users
on conflict (id) do nothing;
create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin' and active);
$$;
create function public.can_access_client(target_client uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p where p.id = (select auth.uid()) and p.active
    and (p.role = 'admin' or exists (
      select 1 from public.client_assignments a where a.user_id = p.id and a.client_id = target_client
    ))
  );
$$;
alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.client_assignments enable row level security;
alter table public.client_datasets enable row level security;
create policy profiles_read on public.profiles for select to authenticated
using (id = (select auth.uid()) or (select public.is_admin()));
create policy clients_read on public.clients for select to authenticated
using (public.can_access_client(id));
create policy assignments_read on public.client_assignments for select to authenticated
using ((select public.is_admin()) or (user_id = (select auth.uid()) and public.can_access_client(client_id)));
create policy datasets_read on public.client_datasets for select to authenticated
using (public.can_access_client(client_id));
-- Escrituras exclusivamente por RPC con validación de administrador en la base.
revoke all on public.profiles, public.clients, public.client_assignments, public.client_datasets from anon, authenticated;
grant select on public.profiles, public.clients, public.client_assignments, public.client_datasets to authenticated;
create function public.manage_executive(target_user uuid, display_name text, enabled boolean, assigned_clients uuid[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise insufficient_privilege using message = 'Administrador requerido'; end if;
  if display_name is null or length(trim(display_name)) not between 1 and 120 or enabled is null or assigned_clients is null then
    raise exception 'Datos de usuario inválidos';
  end if;
  perform 1 from public.profiles where id = target_user and role = 'executive' for update;
  if not found then raise exception 'Ejecutivo no encontrado'; end if;
  if exists (select 1 from unnest(assigned_clients) as x(id)
    where x.id is null or not exists (select 1 from public.clients c where c.id = x.id)) then
    raise exception 'Cliente no encontrado';
  end if;
  update public.profiles set full_name = trim(display_name), active = enabled where id = target_user;
  delete from public.client_assignments where user_id = target_user;
  insert into public.client_assignments (user_id, client_id)
  select target_user, id from (select distinct unnest(assigned_clients) as id) x;
end;
$$;
create function public.import_client_dataset(dataset_kind text, dataset_rows jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  item record;
  target_client uuid;
begin
  if not public.is_admin() then raise insufficient_privilege using message = 'Administrador requerido'; end if;
  if dataset_kind is null or dataset_kind not in ('primas', 'gastos')
    or dataset_rows is null or jsonb_typeof(dataset_rows) <> 'array' then
    raise exception 'Sábana inválida';
  end if;
  if jsonb_array_length(dataset_rows) = 0 then raise exception 'La sábana no contiene filas'; end if;
  if exists (select 1 from jsonb_array_elements(dataset_rows) r
    where jsonb_typeof(r) <> 'object' or coalesce(trim(r ->> 'clientName'), '') = ''
      or coalesce(r ->> 'period', '') !~ '^\d{4}-(0[1-9]|1[0-2])$'
      or coalesce(trim(r ->> 'coverage'), '') = '') then
    raise exception 'Filas sin cliente, período o cobertura válidos';
  end if;
  -- Orden estable para importaciones concurrentes. No borra otros clientes.
  for item in
    select r ->> 'clientName' as name, jsonb_agg(r) as rows,
      array_agg(distinct r ->> 'period' order by r ->> 'period') as periods,
      array_agg(distinct r ->> 'coverage' order by r ->> 'coverage') as coverages
    from jsonb_array_elements(dataset_rows) r group by r ->> 'clientName' order by r ->> 'clientName'
  loop
    insert into public.clients(name) values (item.name)
      on conflict (name) do update set name = excluded.name returning id into target_client;
    insert into public.client_datasets(client_id, kind, rows, periods, coverages)
      values (target_client, dataset_kind, item.rows, item.periods, item.coverages)
      on conflict (client_id, kind) do update set
        rows = excluded.rows, periods = excluded.periods, coverages = excluded.coverages, updated_at = now();
  end loop;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.is_admin(), public.can_access_client(uuid),
  public.manage_executive(uuid, text, boolean, uuid[]), public.import_client_dataset(text, jsonb) from public, anon;
grant execute on function public.is_admin(), public.can_access_client(uuid),
  public.manage_executive(uuid, text, boolean, uuid[]), public.import_client_dataset(text, jsonb) to authenticated;
commit;
