-- Ejecutar después de 202609060001_accounts.sql.
begin;
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('admin', 'executive', 'manager'));
alter table public.profiles add column portfolio_name text;
create unique index profiles_portfolio_identity_idx on public.profiles(role, lower(trim(portfolio_name)))
  where portfolio_name is not null;
alter table public.clients add column kam_name text;
alter table public.clients add column manager_name text;

-- La identidad de la cuenta se vincula explícitamente por el administrador.
-- Los nombres del Excel nunca crean usuarios ni conceden roles.
create or replace function public.can_access_client(target_client uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p where p.id = (select auth.uid()) and p.active and (
      p.role = 'admin'
      or (p.role = 'executive' and exists (
        select 1 from public.client_assignments a where a.user_id = p.id and a.client_id = target_client))
      or exists (select 1 from public.clients c where c.id = target_client
        and nullif(trim(p.portfolio_name), '') is not null and (
          (p.role = 'executive' and lower(trim(c.kam_name)) = lower(trim(p.portfolio_name)))
          or (p.role = 'manager' and lower(trim(c.manager_name)) = lower(trim(p.portfolio_name)))
        ))
    )
  );
$$;

create function public.sync_portfolio_metadata() returns trigger
language plpgsql security definer set search_path = '' as $$
declare latest text; kam text; boss text;
begin
  if new.kind <> 'primas' then return new; end if;
  select max(r->>'period') into latest from jsonb_array_elements(new.rows) r;
  if (select count(distinct lower(trim(r->>'kam'))) from jsonb_array_elements(new.rows) r
      where r->>'period' = latest and nullif(trim(r->>'kam'), '') is not null) > 1
    or (select count(distinct lower(trim(r->>'manager'))) from jsonb_array_elements(new.rows) r
      where r->>'period' = latest and nullif(trim(r->>'manager'), '') is not null) > 1 then
    raise exception 'Un cliente debe tener un KAM y un jefe en su último período';
  end if;
  select max(nullif(trim(r->>'kam'), '')), max(nullif(trim(r->>'manager'), '')) into kam, boss
    from jsonb_array_elements(new.rows) r where r->>'period' = latest;
  update public.clients set kam_name = kam, manager_name = boss where id = new.client_id;
  return new;
end;
$$;
create trigger datasets_portfolio_metadata after insert or update on public.client_datasets
for each row execute function public.sync_portfolio_metadata();
-- Actualiza metadatos de sábanas ya guardadas; las antiguas quedan sin KAM/jefe.
update public.client_datasets set rows = rows where kind = 'primas';

create function public.manage_portfolio_account(target_user uuid, display_name text, enabled boolean,
  assigned_clients uuid[], account_role text, source_name text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise insufficient_privilege using message = 'Administrador requerido'; end if;
  if display_name is null or length(trim(display_name)) not between 1 and 120 or enabled is null
    or assigned_clients is null or account_role is null or account_role not in ('executive', 'manager')
    or length(coalesce(source_name, '')) > 120 then raise exception 'Datos de usuario inválidos'; end if;
  perform 1 from public.profiles where id = target_user and role <> 'admin' for update;
  if not found then raise exception 'Cuenta no encontrada'; end if;
  if exists (select 1 from unnest(assigned_clients) x(id) where x.id is null
    or not exists (select 1 from public.clients c where c.id = x.id)) then raise exception 'Cliente no encontrado'; end if;
  update public.profiles set full_name = trim(display_name), active = enabled, role = account_role,
    portfolio_name = nullif(trim(source_name), '') where id = target_user;
  delete from public.client_assignments where user_id = target_user;
  if account_role = 'executive' then
    insert into public.client_assignments select target_user, id from (select distinct unnest(assigned_clients) id) x;
  end if;
end;
$$;
revoke all on function public.sync_portfolio_metadata() from public, anon, authenticated;
revoke all on function public.manage_portfolio_account(uuid, text, boolean, uuid[], text, text) from public, anon;
grant execute on function public.manage_portfolio_account(uuid, text, boolean, uuid[], text, text) to authenticated;
commit;
