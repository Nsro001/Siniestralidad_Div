-- Después de las migraciones existentes. Logos pequeños por cliente, sin URLs públicas.
begin;
create table public.report_branding (
  client_id uuid primary key references public.clients(id) on delete cascade,
  broker_name text not null default '' check (length(broker_name) <= 120),
  broker_logo text check (broker_logo is null or (length(broker_logo) <= 700000 and broker_logo ~ '^data:image/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$')),
  client_logo text check (client_logo is null or (length(client_logo) <= 700000 and client_logo ~ '^data:image/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$'))
);
alter table public.report_branding enable row level security;
revoke all on public.report_branding from public, anon, authenticated;
grant select, insert, update, delete on public.report_branding to authenticated;
create policy branding_read on public.report_branding for select to authenticated using (public.can_access_client(client_id));
create policy branding_insert on public.report_branding for insert to authenticated with check (public.is_admin());
create policy branding_update on public.report_branding for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy branding_delete on public.report_branding for delete to authenticated using (public.is_admin());
commit;
