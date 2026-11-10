-- Supabase Storage: bucket privado. Nunca usar service_role en el navegador.
begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('portfolio-policies','portfolio-policies',false,20971520,array['application/pdf'])
on conflict(id) do update set public=false,file_size_limit=20971520,allowed_mime_types=array['application/pdf'];
create policy portfolio_pdf_read on storage.objects for select to authenticated
using (bucket_id='portfolio-policies' and exists (
  select 1 from public.portfolio_documents d where d.object_path=name
    and (public.is_admin() or (d.client_id is not null and public.can_access_client(d.client_id)))
));
create policy portfolio_pdf_insert on storage.objects for insert to authenticated
with check (bucket_id='portfolio-policies' and public.is_admin() and exists (
  select 1 from public.portfolio_documents d where d.object_path=name and d.owner_id=auth.uid()
));
-- Sin UPDATE/DELETE: originales inmutables para usuarios funcionales.
commit;
