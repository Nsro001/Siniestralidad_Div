-- Preserva permisos y RLS por cliente de report_branding.
begin;
alter table public.report_branding
  drop constraint report_branding_broker_logo_check,
  drop constraint report_branding_client_logo_check,
  add constraint report_branding_broker_logo_check check (broker_logo is null or (length(broker_logo) <= 700000 and broker_logo ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$')),
  add constraint report_branding_client_logo_check check (client_logo is null or (length(client_logo) <= 700000 and client_logo ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$')),
  add column interior_logo text check (interior_logo is null or (length(interior_logo) <= 700000 and interior_logo ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$'));
commit;
